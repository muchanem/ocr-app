import llm

def transcribe_file(path):
    model = llm.get_model("gemini-2.0-flash")
    prompt = "OCR the attached file into Markdown. \
    Make sure to use Markdown formatting for headings, lists, and paragraphs. \
    If you encounter math or greek symbols, please use LaTeX format delimited by $ or $$. \
    If you encounter tables, please use Markdown table format. \
    If you encounter code, please use Markdown code block format. Only use code blocks for code. \
    If you encounter a simple diagram, please use a mermaid code block. \
    Do not add any commentary or delimiters to your response."
    attachment = llm.Attachment(path=path)
    response = model.prompt(prompt, attachments=[attachment])
    return response.text()
