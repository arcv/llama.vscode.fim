# TODO — llama-vscode-fim

## Planned Features

### Inline Code Generation
Allow the user to write a natural-language prompt inline (e.g. on a blank line or via a command), send it to the same llama-server `/v1/completions` backend already used for FIM, and insert the returned code at the cursor position.

---

### Use `.code-workspace` for Extra Context
When a `.code-workspace` file is present in the workspace root, parse it and feed relevant metadata to the LLM as additional context in each completion request. This gives the model awareness of the project's folder layout, recommended extensions, and any workspace-level settings that hint at the tech stack.