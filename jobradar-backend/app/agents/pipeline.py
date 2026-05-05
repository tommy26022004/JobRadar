import json
import re
from typing import TypedDict, AsyncIterator
from langgraph.graph import StateGraph, END
from groq import AsyncGroq
from app.core.config import settings

client = AsyncGroq(api_key=settings.GROQ_API_KEY)
MODEL = "llama-3.3-70b-versatile"


async def _call(prompt: str) -> str:
    response = await client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    return response.choices[0].message.content.strip()


class AgentState(TypedDict):
    raw_jd: str
    cv_content: str
    parsed_title: str
    parsed_company: str
    parsed_stack: str
    parsed_requirements: str
    parsed_salary: str
    match_score: float
    ai_analysis: str
    cv_suggestions: str


async def node_parse_jd(state: AgentState) -> AgentState:
    prompt = f"""Extract the following fields from this job description. Return ONLY a JSON object with these keys:
- title: job title
- company: company name (or "Unknown" if not found)
- stack: comma-separated list of tech stack / tools required
- requirements: key requirements in 3-5 bullet points
- salary: salary range (or "Not specified" if not found)

Job Description:
{state["raw_jd"]}

Return valid JSON only, no markdown, no explanation."""

    text = await _call(prompt)
    text = re.sub(r"^```json|^```|```$", "", text, flags=re.MULTILINE).strip()
    data = json.loads(text)

    return {
        **state,
        "parsed_title": data.get("title", ""),
        "parsed_company": data.get("company", "Unknown"),
        "parsed_stack": data.get("stack", ""),
        "parsed_requirements": data.get("requirements", ""),
        "parsed_salary": data.get("salary", "Not specified"),
    }


async def node_match_cv(state: AgentState) -> AgentState:
    prompt = f"""You are a technical recruiter. Compare the job requirements with the candidate's CV and give a match score.

Job Requirements:
- Stack: {state["parsed_stack"]}
- Requirements: {state["parsed_requirements"]}

Candidate CV:
{state["cv_content"]}

Return ONLY a JSON object with these keys:
- score: integer from 0 to 100
- analysis: 3-4 sentences explaining the match, what fits well and what doesn't

Return valid JSON only, no markdown, no explanation."""

    text = await _call(prompt)
    text = re.sub(r"^```json|^```|```$", "", text, flags=re.MULTILINE).strip()
    data = json.loads(text)

    return {
        **state,
        "match_score": float(data.get("score", 0)),
        "ai_analysis": data.get("analysis", ""),
    }


async def node_suggest_cv(state: AgentState) -> AgentState:
    prompt = f"""Based on the job requirements and the candidate's CV, provide specific actionable suggestions to improve the CV for this role.

Job Stack: {state["parsed_stack"]}
Job Requirements: {state["parsed_requirements"]}
Current Match Score: {state["match_score"]}/100

Candidate CV:
{state["cv_content"]}

Provide 3-5 specific, actionable bullet points on what to add, highlight, or change in the CV to better match this job.
Be concrete — mention specific skills, projects, or phrasing to use.
Return plain text bullet points only, no JSON."""

    text = await _call(prompt)
    return {**state, "cv_suggestions": text}


def build_pipeline() -> StateGraph:
    graph = StateGraph(AgentState)
    graph.add_node("parse_jd", node_parse_jd)
    graph.add_node("match_cv", node_match_cv)
    graph.add_node("suggest_cv", node_suggest_cv)
    graph.set_entry_point("parse_jd")
    graph.add_edge("parse_jd", "match_cv")
    graph.add_edge("match_cv", "suggest_cv")
    graph.add_edge("suggest_cv", END)
    return graph.compile()


pipeline = build_pipeline()


async def run_pipeline_streaming(raw_jd: str, cv_content: str) -> AsyncIterator[str]:
    state = AgentState(
        raw_jd=raw_jd,
        cv_content=cv_content,
        parsed_title="",
        parsed_company="",
        parsed_stack="",
        parsed_requirements="",
        parsed_salary="",
        match_score=0.0,
        ai_analysis="",
        cv_suggestions="",
    )

    yield "data: {\"event\": \"start\", \"message\": \"Analyzing job description...\"}\n\n"

    async for event in pipeline.astream(state):
        node_name = list(event.keys())[0]
        node_state = event[node_name]

        if node_name == "parse_jd":
            yield f"data: {{\"event\": \"parsed\", \"title\": {json.dumps(node_state.get('parsed_title', ''))}, \"company\": {json.dumps(node_state.get('parsed_company', ''))}, \"stack\": {json.dumps(node_state.get('parsed_stack', ''))}, \"salary\": {json.dumps(node_state.get('parsed_salary', ''))}}}\n\n"

        elif node_name == "match_cv":
            yield f"data: {{\"event\": \"matched\", \"score\": {node_state.get('match_score', 0)}, \"analysis\": {json.dumps(node_state.get('ai_analysis', ''))}}}\n\n"

        elif node_name == "suggest_cv":
            yield f"data: {{\"event\": \"suggested\", \"suggestions\": {json.dumps(node_state.get('cv_suggestions', ''))}}}\n\n"

    yield "data: {\"event\": \"done\"}\n\n"
