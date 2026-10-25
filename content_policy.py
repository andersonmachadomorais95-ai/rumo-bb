PRACTICE_BLOCKING_REASONS = {
    "estrutura_incompleta",
    "gabarito_ausente",
    "gabarito_incompativel",
    "gabarito_flags_divergentes",
    "familia_com_gabaritos_divergentes",
    "elemento_visual_ausente",
    "contexto_ou_visual_a_conferir",
    "extracao_automatica_pendente",
}


def is_practice_eligible(question, alternatives, answer):
    if PRACTICE_BLOCKING_REASONS.intersection(question.get("motivos", [])):
        return False
    letters = {alternative.get("letra") for alternative in alternatives}
    return len(alternatives) >= 2 and bool(answer) and answer.get("resposta") in letters
