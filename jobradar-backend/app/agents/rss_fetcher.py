import httpx
import xml.etree.ElementTree as ET
from dataclasses import dataclass
import re


FEEDS = {
    "programming": "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "devops": "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
    "design": "https://weworkremotely.com/categories/remote-design-jobs.rss",
    "all": "https://weworkremotely.com/remote-jobs.rss",
}


@dataclass
class RemoteJob:
    id: str
    title: str
    company: str
    url: str
    description: str
    region: str


def _clean_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


async def fetch_jobs(category: str = "programming", limit: int = 20) -> list[RemoteJob]:
    feed_url = FEEDS.get(category, FEEDS["programming"])
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(feed_url, headers={"User-Agent": "JobRadar/1.0"})
        resp.raise_for_status()

    root = ET.fromstring(resp.text)
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

        # WWR puts "Company: Title" in title
        raw_title = title_el.text or "" if title_el is not None else ""
        parts = raw_title.split(":", 1)
        company = parts[0].strip() if len(parts) > 1 else ""
        title = parts[1].strip() if len(parts) > 1 else raw_title

        # fallback to dedicated company tag
        if company_el is not None and company_el.text:
            company = company_el.text.strip()

        description = _clean_html(desc_el.text or "") if desc_el is not None else ""
        description = description[:3000]  # cap to avoid token overflow

        guid_el = item.find("guid")
        job_id = guid_el.text or link_el.text or "" if guid_el is not None else (link_el.text or "")

        jobs.append(RemoteJob(
            id=job_id,
            title=title,
            company=company,
            url=link_el.text or "" if link_el is not None else "",
            description=description,
            region=region_el.text or "Worldwide" if region_el is not None else "Worldwide",
        ))

    return jobs
