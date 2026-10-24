def is_practice_eligible(question, alternatives, answer):
    letters = {alternative.get("letra") for alternative in alternatives}
    return len(alternatives) >= 2 and bool(answer) and answer.get("resposta") in letters
