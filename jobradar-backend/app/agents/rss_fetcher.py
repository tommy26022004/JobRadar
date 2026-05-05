import httpx
import xml.etree.ElementTree as ET
from dataclasses import dataclass
import re
import asyncio


WWR_FEEDS = {
    "programming": "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "devops": "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
    "design": "https://weworkremotely.com/categories/remote-design-jobs.rss",
    "all": "https://weworkremotely.com/remote-jobs.rss",
}

REMOTEOK_FEED = "https://remoteok.com/remote-jobs.rss"
REMOTIVE_FEED = "https://remotive.com/api/remote-jobs"


@dataclass
class RemoteJob:
    id: str
    title: str
    company: str
    url: str
    description: str
    region: str
    source: str = "WeWorkRemotely"


def _clean_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&#\d+;", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


async def _fetch_wwr_feed(client: httpx.AsyncClient, url: str, limit: int) -> list[RemoteJob]:
    try:
        resp = await client.get(url, headers={"User-Agent": "JobRadar/1.0"})
        resp.raise_for_status()
    except Exception:
        return []

    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError:
        return []

    channel = root.find("channel")
    if channel is None:
        return []

    jobs = []
    for item in channel.findall("item")[:limit]:
        title_el = item.find("title")
        link_el = item.find("link")
        desc_el = item.find("description")
        region_el = item.find("region")
        company_el = item.find("company")

        raw_title = title_el.text or "" if title_el is not None else ""
        parts = raw_title.split(":", 1)
        company = parts[0].strip() if len(parts) > 1 else ""
        title = parts[1].strip() if len(parts) > 1 else raw_title

        if company_el is not None and company_el.text:
            company = company_el.text.strip()

        description = _clean_html(desc_el.text or "") if desc_el is not None else ""
        description = description[:3000]

        guid_el = item.find("guid")
        job_id = guid_el.text or "" if guid_el is not None else ""
        if not job_id:
            job_id = link_el.text or "" if link_el is not None else ""

        link = link_el.text or "" if link_el is not None else ""

        if not title or not link:
            continue

        jobs.append(RemoteJob(
            id=job_id,
            title=title,
            company=company,
            url=link,
            description=description,
            region=region_el.text or "Worldwide" if region_el is not None else "Worldwide",
            source="WeWorkRemotely",
        ))

    return jobs


async def _fetch_remoteok(client: httpx.AsyncClient, limit: int) -> list[RemoteJob]:
    try:
        resp = await client.get(REMOTEOK_FEED, headers={"User-Agent": "JobRadar/1.0"})
        resp.raise_for_status()
    except Exception:
        return []

    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError:
        return []

    channel = root.find("channel")
    if channel is None:
        return []

    jobs = []
    for item in channel.findall("item")[:limit]:
        title_el = item.find("title")
        link_el = item.find("link")
        desc_el = item.find("description")

        title = re.sub(r"\s+", " ", title_el.text or "").strip() if title_el is not None else ""
        link = (link_el.text or "").strip() if link_el is not None else ""

        # RemoteOK title format: "Company - Title" or just title
        company = ""
        if " - " in title:
            parts = title.split(" - ", 1)
            company = parts[0].strip()
            title = parts[1].strip()

        description = _clean_html(desc_el.text or "") if desc_el is not None else ""
        description = description[:3000]

        guid_el = item.find("guid")
        job_id = guid_el.text or link if guid_el is not None else link

        if not title or not link:
            continue

        jobs.append(RemoteJob(
            id=job_id,
            title=title,
            company=company,
            url=link,
            description=description,
            region="Worldwide",
            source="RemoteOK",
        ))

    return jobs


async def _fetch_remotive(client: httpx.AsyncClient, limit: int) -> list[RemoteJob]:
    # Remotive has a JSON API
    try:
        resp = await client.get(REMOTIVE_FEED, headers={"User-Agent": "JobRadar/1.0"}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    jobs = []
    for item in data.get("jobs", [])[:limit]:
        title = item.get("title", "")
        company = item.get("company_name", "")
        url = item.get("url", "")
        description = _clean_html(item.get("description", ""))[:3000]
        job_id = str(item.get("id", url))
        candidate_required = item.get("candidate_required_location", "Worldwide")

        if not title or not url:
            continue

        jobs.append(RemoteJob(
            id=job_id,
            title=title,
            company=company,
            url=url,
            description=description,
            region=candidate_required or "Worldwide",
            source="Remotive",
        ))

    return jobs


async def _fetch_custom_rss(client: httpx.AsyncClient, url: str, limit: int) -> list[RemoteJob]:
    """Generic RSS parser for custom URLs."""
    try:
        resp = await client.get(url, headers={"User-Agent": "JobRadar/1.0"}, timeout=15)
        resp.raise_for_status()
    except Exception:
        return []

    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError:
        return []

    # Support both RSS (channel/item) and Atom (entry) formats
    channel = root.find("channel")
    if channel is not None:
        items = channel.findall("item")[:limit]
    else:
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        items = root.findall("atom:entry", ns)[:limit]
        if not items:
            items = root.findall("{http://www.w3.org/2005/Atom}entry")[:limit]

    jobs = []
    for item in items:
        # Try both RSS and Atom tag names
        def get_text(tag, alt=None):
            el = item.find(tag)
            if el is None and alt:
                el = item.find(alt)
            if el is None:
                return ""
            return (el.text or "").strip()

        title = get_text("title")
        link_el = item.find("link")
        if link_el is not None:
            link = link_el.text or link_el.get("href", "")
        else:
            link = ""

        description = _clean_html(get_text("description") or get_text("summary") or get_text("content"))[:3000]
        guid_el = item.find("guid")
        job_id = (guid_el.text if guid_el is not None else None) or link

        # Try to extract company from title "Company: Title" or "Company - Title"
        company = ""
        for sep in [":", " - "]:
            if sep in title:
                parts = title.split(sep, 1)
                company = parts[0].strip()
                title = parts[1].strip()
                break

        if not title or not link:
            continue

        jobs.append(RemoteJob(
            id=job_id,
            title=title,
            company=company,
            url=link,
            description=description,
            region="Worldwide",
            source=url,
        ))

    return jobs


async def fetch_all_jobs(
    limit_per_source: int = 50,
    sources: list[str] | None = None,
    custom_urls: list[str] | None = None,
) -> list[RemoteJob]:
    """
    Fetch jobs from all enabled sources in parallel, deduplicate by URL.
    sources: list of source names to include — ["wwr", "remoteok", "remotive"]
             defaults to all three if None
    custom_urls: extra RSS feed URLs to scrape
    """
    if sources is None:
        sources = ["wwr", "remoteok", "remotive"]

    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        tasks = []

        if "wwr" in sources:
            for feed_url in WWR_FEEDS.values():
                tasks.append(_fetch_wwr_feed(client, feed_url, limit_per_source))

        if "remoteok" in sources:
            tasks.append(_fetch_remoteok(client, limit_per_source))

        if "remotive" in sources:
            tasks.append(_fetch_remotive(client, limit_per_source))

        for url in (custom_urls or []):
            tasks.append(_fetch_custom_rss(client, url, limit_per_source))

        results = await asyncio.gather(*tasks, return_exceptions=True)

    # Merge + deduplicate by URL
    seen_urls: set[str] = set()
    all_jobs: list[RemoteJob] = []
    for result in results:
        if isinstance(result, Exception):
            continue
        for job in result:
            if job.url and job.url not in seen_urls:
                seen_urls.add(job.url)
                all_jobs.append(job)

    return all_jobs


# Keep backward-compat for existing code
async def fetch_jobs(category: str = "programming", limit: int = 20) -> list[RemoteJob]:
    feed_url = WWR_FEEDS.get(category, WWR_FEEDS["programming"])
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        return await _fetch_wwr_feed(client, feed_url, limit)
