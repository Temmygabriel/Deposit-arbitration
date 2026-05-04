# v0.1.1
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json


class AppealArbitration(gl.Contract):

    case_count: u256
    cases: TreeMap[u256, str]

    def __init__(self):
        self.case_count = u256(0)

    def _run_verdict(self, state: dict) -> dict:
        host_name = state["host_name"]
        guest_name = state["guest_name"]
        property_address = state["property_address"]
        deposit_amount = state["deposit_amount"]
        agreement_terms = state["agreement_terms"]
        host_claim = state["host_claim"]
        host_evidence = state["host_evidence"]
        guest_claim = state["guest_claim"]
        guest_evidence = state["guest_evidence"]

        def generate():
            raw = gl.nondet.exec_prompt(
                f"You are an impartial arbitration judge resolving a shortlet/Airbnb caution fee dispute. "
                f"Property: {property_address}. "
                f"Caution fee amount: {deposit_amount}. "
                f"Original agreement terms: {agreement_terms}. "
                f"HOST ({host_name}) claims: {host_claim}. "
                f"HOST evidence: {host_evidence}. "
                f"GUEST ({guest_name}) claims: {guest_claim}. "
                f"GUEST evidence: {guest_evidence}. "
                "Based ONLY on the claims and evidence above, decide who wins this caution fee dispute. "
                "Return ONLY this exact JSON with no extra text, no markdown, no backticks: "
                '{"winner": "host" or "guest", "verdict": "one sentence ruling", "reasoning": "2-3 sentence explanation citing specific evidence"}'
            )
            clean = raw.strip()
            for fence in ["```json", "```JSON", "```", "`"]:
                clean = clean.replace(fence, "")
            clean = clean.strip()
            start = clean.find("{")
            end = clean.rfind("}") + 1
            if start != -1 and end > start:
                clean = clean[start:end]
            return clean

        result = gl.eq_principle.prompt_non_comparative(
            generate,
            task="arbitrate shortlet caution fee dispute",
            criteria="valid JSON with winner (host or guest), verdict, and reasoning fields"
        )
        try:
            parsed = json.loads(result)
            winner = str(parsed.get("winner", "guest")).strip().lower()
            if winner not in ("host", "guest"):
                winner = "guest"
            parsed["winner"] = winner
            return parsed
        except Exception:
            return {
                "winner": "guest",
                "verdict": "Insufficient evidence to rule against guest. Caution fee returned.",
                "reasoning": "The evidence presented was inconclusive. In cases of doubt, the caution fee is returned to the guest."
            }

    def _run_appeal_verdict(self, state: dict) -> dict:
        host_name = state["host_name"]
        guest_name = state["guest_name"]
        property_address = state["property_address"]
        deposit_amount = state["deposit_amount"]
        agreement_terms = state["agreement_terms"]
        host_claim = state["host_claim"]
        host_evidence = state["host_evidence"]
        guest_claim = state["guest_claim"]
        guest_evidence = state["guest_evidence"]
        round1_winner = state["round1_winner"]
        round1_verdict = state["round1_verdict"]
        round1_reasoning = state["round1_reasoning"]
        appeal_party = state["appeal_party"]
        appeal_reason = state["appeal_reason"]

        def generate():
            raw = gl.nondet.exec_prompt(
                f"You are a senior appellate arbitration judge reviewing a caution fee dispute appeal. "
                f"Property: {property_address}. "
                f"Caution fee amount: {deposit_amount}. "
                f"Original agreement terms: {agreement_terms}. "
                f"HOST ({host_name}) claims: {host_claim}. HOST evidence: {host_evidence}. "
                f"GUEST ({guest_name}) claims: {guest_claim}. GUEST evidence: {guest_evidence}. "
                f"ROUND 1 VERDICT: {round1_winner} won. Ruling: {round1_verdict}. Reasoning: {round1_reasoning}. "
                f"APPEAL filed by: {appeal_party}. Appeal reason: {appeal_reason}. "
                "Review the original verdict carefully. You MUST explicitly state whether you are upholding or overturning the previous verdict and WHY. "
                "Consider whether the appeal raises new points not addressed in round 1. "
                "Return ONLY this exact JSON with no extra text, no markdown, no backticks: "
                '{"winner": "host" or "guest", "verdict": "one sentence final ruling", "reasoning": "2-3 sentences", "appeal_outcome": "upheld" or "overturned", "appeal_address": "one sentence explaining why you upheld or overturned the round 1 verdict"}'
            )
            clean = raw.strip()
            for fence in ["```json", "```JSON", "```", "`"]:
                clean = clean.replace(fence, "")
            clean = clean.strip()
            start = clean.find("{")
            end = clean.rfind("}") + 1
            if start != -1 and end > start:
                clean = clean[start:end]
            return clean

        result = gl.eq_principle.prompt_non_comparative(
            generate,
            task="review appeal of shortlet caution fee arbitration",
            criteria="valid JSON with winner, verdict, reasoning, appeal_outcome, and appeal_address fields"
        )
        try:
            parsed = json.loads(result)
            winner = str(parsed.get("winner", round1_winner)).strip().lower()
            if winner not in ("host", "guest"):
                winner = round1_winner
            parsed["winner"] = winner
            appeal_outcome = str(parsed.get("appeal_outcome", "upheld")).strip().lower()
            if appeal_outcome not in ("upheld", "overturned"):
                appeal_outcome = "upheld"
            parsed["appeal_outcome"] = appeal_outcome
            return parsed
        except Exception:
            return {
                "winner": round1_winner,
                "verdict": "Original verdict upheld on appeal.",
                "reasoning": "The appeal did not present sufficient new grounds to overturn the original ruling.",
                "appeal_outcome": "upheld",
                "appeal_address": "The appellate panel reviewed the original reasoning and found it sound. No new compelling evidence was presented."
            }

    @gl.public.write
    def create_case(
        self,
        host_name: str,
        guest_name: str,
        property_address: str,
        deposit_amount: str,
        agreement_terms: str,
    ) -> None:
        case_id = int(self.case_count) + 1
        self.case_count = u256(case_id)
        state = {
            "case_id": case_id,
            "host_name": host_name,
            "guest_name": guest_name,
            "property_address": property_address,
            "deposit_amount": deposit_amount,
            "agreement_terms": agreement_terms,
            "host_claim": "",
            "host_evidence": "",
            "guest_claim": "",
            "guest_evidence": "",
            "status": "awaiting_claims",
            "round": 1,
            "round1_winner": "",
            "round1_verdict": "",
            "round1_reasoning": "",
            "appeal_party": "",
            "appeal_reason": "",
            "winner": "",
            "verdict": "",
            "reasoning": "",
            "appeal_outcome": "",
            "appeal_address": "",
            "is_final": False,
        }
        self.cases[u256(case_id)] = json.dumps(state)

    @gl.public.write
    def submit_host_claim(
        self,
        case_id: int,
        host_claim: str,
        host_evidence: str,
    ) -> None:
        key = u256(case_id)
        if key not in self.cases:
            raise gl.vm.UserError("Case not found")
        state = json.loads(self.cases[key])
        if state["status"] != "awaiting_claims":
            raise gl.vm.UserError("Case is not accepting claims")
        state["host_claim"] = host_claim
        state["host_evidence"] = host_evidence
        self.cases[key] = json.dumps(state)

    @gl.public.write
    def submit_guest_claim(
        self,
        case_id: int,
        guest_claim: str,
        guest_evidence: str,
    ) -> None:
        key = u256(case_id)
        if key not in self.cases:
            raise gl.vm.UserError("Case not found")
        state = json.loads(self.cases[key])
        if state["status"] != "awaiting_claims":
            raise gl.vm.UserError("Case is not accepting claims")
        state["guest_claim"] = guest_claim
        state["guest_evidence"] = guest_evidence
        self.cases[key] = json.dumps(state)

    @gl.public.write
    def request_verdict(self, case_id: int) -> None:
        key = u256(case_id)
        if key not in self.cases:
            raise gl.vm.UserError("Case not found")
        state = json.loads(self.cases[key])
        if not state["host_claim"] or not state["guest_claim"]:
            raise gl.vm.UserError("Both parties must submit claims before verdict")
        if state["status"] != "awaiting_claims":
            raise gl.vm.UserError("Case is not ready for verdict")

        result = self._run_verdict(state)

        state["round1_winner"] = result.get("winner", "guest")
        state["round1_verdict"] = result.get("verdict", "")
        state["round1_reasoning"] = result.get("reasoning", "")
        state["winner"] = result.get("winner", "guest")
        state["verdict"] = result.get("verdict", "")
        state["reasoning"] = result.get("reasoning", "")
        state["status"] = "round1_complete"
        state["round"] = 1
        self.cases[key] = json.dumps(state)

    @gl.public.write
    def file_appeal(
        self,
        case_id: int,
        appeal_party: str,
        appeal_reason: str,
    ) -> None:
        key = u256(case_id)
        if key not in self.cases:
            raise gl.vm.UserError("Case not found")
        state = json.loads(self.cases[key])
        if state["status"] != "round1_complete":
            raise gl.vm.UserError("Can only appeal after round 1 verdict")
        if appeal_party not in ("host", "guest"):
            raise gl.vm.UserError("appeal_party must be host or guest")
        state["appeal_party"] = appeal_party
        state["appeal_reason"] = appeal_reason
        state["status"] = "appeal_filed"
        self.cases[key] = json.dumps(state)

    @gl.public.write
    def resolve_appeal(self, case_id: int) -> None:
        key = u256(case_id)
        if key not in self.cases:
            raise gl.vm.UserError("Case not found")
        state = json.loads(self.cases[key])
        if state["status"] != "appeal_filed":
            raise gl.vm.UserError("No appeal filed for this case")

        result = self._run_appeal_verdict(state)

        state["winner"] = result.get("winner", state["round1_winner"])
        state["verdict"] = result.get("verdict", "")
        state["reasoning"] = result.get("reasoning", "")
        state["appeal_outcome"] = result.get("appeal_outcome", "upheld")
        state["appeal_address"] = result.get("appeal_address", "")
        state["status"] = "final"
        state["round"] = 2
        state["is_final"] = True
        self.cases[key] = json.dumps(state)

    @gl.public.write
    def accept_verdict(self, case_id: int) -> None:
        key = u256(case_id)
        if key not in self.cases:
            raise gl.vm.UserError("Case not found")
        state = json.loads(self.cases[key])
        if state["status"] != "round1_complete":
            raise gl.vm.UserError("Can only accept verdict after round 1")
        state["status"] = "final"
        state["is_final"] = True
        self.cases[key] = json.dumps(state)

    @gl.public.view
    def get_case(self, case_id: int) -> str:
        key = u256(case_id)
        if key in self.cases:
            return self.cases[key]
        return ""

    @gl.public.view
    def get_case_count(self) -> int:
        return int(self.case_count)
