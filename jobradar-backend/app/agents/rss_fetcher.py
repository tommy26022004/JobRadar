import httpx
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
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

# job_type values
JOB_TYPE_FULL = "full-time"
JOB_TYPE_PART = "part-time"
JOB_TYPE_CONTRACT = "contract"
JOB_TYPE_FREELANCE = "freelance"
JOB_TYPE_UNKNOWN = "unknown"

# region_group values — used for timezone filtering
REGION_APAC = "Asia-Pacific"
REGION_EUROPE = "Europe"
REGION_AMERICAS = "Americas"
REGION_WORLDWIDE = "Worldwide"

# experience_level values
EXP_INTERN = "intern"
EXP_ENTRY = "entry"
EXP_MID = "mid"
EXP_SENIOR = "senior"
EXP_MANAGER = "manager"
EXP_UNKNOWN = "unknown"


@dataclass
class RemoteJob:
    id: str
    title: str
    company: str
    url: str
    description: str
    region: str
    source: str = "WeWorkRemotely"
    job_type: str = JOB_TYPE_UNKNOWN
    region_group: str = REGION_WORLDWIDE
    experience_level: str = EXP_UNKNOWN


def _clean_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&#\d+;", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _detect_experience_level(title: str, description: str) -> str:
    """Detect experience level from title and first 800 chars of description."""
    # Title is most reliable signal — check it first with higher priority
    t = title.lower()

    # Manager+ — check title only (avoid false positives in JD body)
    if re.search(r"\b(vp|vice president|director|head of|principal|staff engineer|distinguished)\b", t):
        return EXP_MANAGER
    if re.search(r"\b(engineering manager|product manager|people manager)\b", t):
        return EXP_MANAGER

    # Senior — title first
    if re.search(r"\b(senior|sr\.?|lead|architect|tech lead|team lead)\b", t):
        return EXP_SENIOR

    # Intern — title first
    if re.search(r"\b(intern|internship|trainee|graduate program|apprentice)\b", t):
        return EXP_INTERN

    # Entry/Junior — title first
    if re.search(r"\b(junior|jr\.?|entry.?level|associate|graduate|new grad|fresh)\b", t):
        return EXP_ENTRY

    # Mid — title first
    if re.search(r"\b(mid.?level|mid.?senior|intermediate)\b", t):
        return EXP_MID

    # Fall back to description scan for year requirements
    desc = description[:800].lower()
    year_match = re.search(r"(\d+)\+?\s*(?:to\s*\d+\s*)?years?\s*(?:of\s*)?(?:experience|exp)", desc)
    if year_match:
        yrs = int(year_match.group(1))
        if yrs >= 10:
            return EXP_MANAGER
        if yrs >= 5:
            return EXP_SENIOR
        if yrs >= 2:
            return EXP_MID
        if yrs <= 1:
            return EXP_ENTRY

    # Description keywords as last resort
    if re.search(r"\b(senior|sr\.?|lead engineer|tech lead)\b", desc):
        return EXP_SENIOR
    if re.search(r"\b(junior|jr\.?|entry.?level|new grad)\b", desc):
        return EXP_ENTRY
    if re.search(r"\b(intern|internship)\b", desc):
        return EXP_INTERN

    return EXP_UNKNOWN


def _detect_job_type(title: str, description: str) -> str:
    """Detect job type from title and description text."""
    text = (title + " " + description[:500]).lower()
    if re.search(r"\bpart[- ]time\b", text):
        return JOB_TYPE_PART
    if re.search(r"\bfreelance\b", text):
        return JOB_TYPE_FREELANCE
    if re.search(r"\bcontract\b|\bcontractor\b", text):
        return JOB_TYPE_CONTRACT
    if re.search(r"\bfull[- ]time\b", text):
        return JOB_TYPE_FULL
    return JOB_TYPE_UNKNOWN


def _normalize_region_group(region: str) -> str:
    """Map raw region string to one of 4 timezone groups."""
    r = region.lower()

    apac_kw = ["asia", "apac", "pacific", "australia", "singapore", "malaysia",
               "japan", "korea", "india", "china", "taiwan", "philippines",
               "indonesia", "vietnam", "thailand", "new zealand", "hong kong"]
    europe_kw = ["europe", "european", "eu", "uk", "emea", "germany", "france",
                 "spain", "italy", "netherlands", "poland", "portugal", "sweden",
                 "norway", "denmark", "finland", "switzerland", "austria",
                 "belgium", "ireland", "czech", "romania", "ukraine"]
    americas_kw = ["usa", "us only", "united states", "america", "canada",
                   "latin america", "latam", "mexico", "brazil", "argentina",
                   "colombia", "chile", "peru", "north america"]

    for kw in apac_kw:
        if kw in r:
            return REGION_APAC
    for kw in americas_kw:
        if kw in r:
            return REGION_AMERICAS
    for kw in europe_kw:
        if kw in r:
            return REGION_EUROPE

    # "worldwide" / empty / unknown → truly global
    return REGION_WORLDWIDE


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

        region = region_el.text or "Worldwide" if region_el is not None else "Worldwide"

        jobs.append(RemoteJob(
            id=job_id,
            title=title,
            company=company,
            url=link,
            description=description,
            region=region,
            source="WeWorkRemotely",
            job_type=_detect_job_type(title, description),
            region_group=_normalize_region_group(region),
            experience_level=_detect_experience_level(title, description),
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

        company = ""
        if " - " in title:
            parts = title.split(" - ", 1)
            company = parts[0].strip()
            title = parts[1].strip()

        description = _clean_html(desc_el.text or "") if desc_el is not None else ""
        description = description[:3000]

        guid_el = item.find("guid")
        job_id = guid_el.text or link if guid_el is not None else link

        # RemoteOK has <tag> elements with job type info
        tags = [t.text or "" for t in item.findall("tag")]
        tags_text = " ".join(tags).lower()

        if "part-time" in tags_text or "part time" in tags_text:
            job_type = JOB_TYPE_PART
        elif "contract" in tags_text:
            job_type = JOB_TYPE_CONTRACT
        elif "freelance" in tags_text:
            job_type = JOB_TYPE_FREELANCE
        else:
            job_type = _detect_job_type(title, description)

        # RemoteOK has <location> tag sometimes
        location_el = item.find("location")
        region = location_el.text or "Worldwide" if location_el is not None else "Worldwide"

        if not title or not link:
            continue

        jobs.append(RemoteJob(
            id=job_id,
            title=title,
            company=company,
            url=link,
            description=description,
            region=region,
            source="RemoteOK",
            job_type=job_type,
            region_group=_normalize_region_group(region),
            experience_level=_detect_experience_level(title, description),
        ))

    return jobs


async def _fetch_remotive(client: httpx.AsyncClient, limit: int) -> list[RemoteJob]:
    try:
        resp = await client.get(REMOTIVE_FEED, headers={"User-Agent": "JobRadar/1.0"}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    # Remotive job_type values: "full_time", "part_time", "contract", "freelance"
    type_map = {
        "full_time": JOB_TYPE_FULL,
        "part_time": JOB_TYPE_PART,
        "contract": JOB_TYPE_CONTRACT,
        "freelance": JOB_TYPE_FREELANCE,
    }

    jobs = []
    for item in data.get("jobs", [])[:limit]:
        title = item.get("title", "")
        company = item.get("company_name", "")
        url = item.get("url", "")
        description = _clean_html(item.get("description", ""))[:3000]
        job_id = str(item.get("id", url))
        region = item.get("candidate_required_location", "") or "Worldwide"
        raw_type = item.get("job_type", "")
        job_type = type_map.get(raw_type, _detect_job_type(title, description))

        if not title or not url:
            continue

        jobs.append(RemoteJob(
            id=job_id,
            title=title,
            company=company,
            url=url,
            description=description,
            region=region,
            source="Remotive",
            job_type=job_type,
            region_group=_normalize_region_group(region),
            experience_level=_detect_experience_level(title, description),
        ))

    return jobs


async def _fetch_custom_rss(client: httpx.AsyncClient, url: str, limit: int) -> list[RemoteJob]:
    try:
        resp = await client.get(url, headers={"User-Agent": "JobRadar/1.0"}, timeout=15)
        resp.raise_for_status()
    except Exception:
        return []

    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError:
        return []

    channel = root.find("channel")
    if channel is not None:
        items = channel.findall("item")[:limit]
    else:
        items = root.findall("{http://www.w3.org/2005/Atom}entry")[:limit]

    jobs = []
    for item in items:
        def get_text(tag: str) -> str:
            el = item.find(tag)
            return (el.text or "").strip() if el is not None else ""

        title = get_text("title")
        link_el = item.find("link")
        if link_el is not None:
            link = (link_el.text or link_el.get("href", "")).strip()
        else:
            link = ""

        description = _clean_html(
            get_text("description") or get_text("summary") or get_text("content")
        )[:3000]

        guid_el = item.find("guid")
        job_id = (guid_el.text if guid_el is not None else None) or link

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
            job_type=_detect_job_type(title, description),
            region_group=REGION_WORLDWIDE,
            experience_level=_detect_experience_level(title, description),
        ))

    return jobs


async def fetch_all_jobs(
    limit_per_source: int = 50,
    sources: list[str] | None = None,
    custom_urls: list[str] | None = None,
) -> list[RemoteJob]:
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


async def fetch_jobs(category: str = "programming", limit: int = 20) -> list[RemoteJob]:
    feed_url = WWR_FEEDS.get(category, WWR_FEEDS["programming"])
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        return await _fetch_wwr_feed(client, feed_url, limit)
