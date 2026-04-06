# llama.vscode.fim

Stripped-down version of the ggml-org/llama.vscode extension, focused exclusively on FIM (Fill-In-the-Middle) auto-completion.

---

## Features

- Auto-suggest on input with configurable debounce delay
- Accept a suggestion with `Tab`
- Accept the first line of a suggestion with `Shift + Tab`
- Accept the next word with `Ctrl/Cmd + Right`
- Toggle the suggestion manually by pressing `Ctrl + L`
- Control max text generation time
- Configure scope of context around the cursor
- Ring context with chunks from open and edited files
- Display performance stats
- Use your local or external model server that supports FIM
- Toggle debug logging on/off via settings

## Installation

### `llama.cpp` setup

Open the llama-vscode-fim menu by clicking on the status bar indicator or pressing `Ctrl+Shift+M`, then select "Install/Upgrade llama.cpp". This will install llama.cpp automatically on Mac and Windows. On Linux, get the [latest binaries](https://github.com/ggerganov/llama.cpp/releases) and add the bin folder to your PATH.

Once llama.cpp is installed, you can select and start a model from the menu.

Below are some details on how to install llama.cpp manually (if you prefer it).

#### Mac OS

```bash
brew install llama.cpp
```

#### Windows

```bash
winget install llama.cpp
```

#### Any other OS

Either use the [latest binaries](https://github.com/ggerganov/llama.cpp/releases) or [build llama.cpp from source](https://github.com/ggerganov/llama.cpp/blob/master/docs/build.md). For more information on how to run the `llama.cpp` server, please refer to the [Wiki](https://github.com/ggml-org/llama.vscode/wiki).

### llama.cpp settings

Here are recommended settings, depending on the amount of VRAM that you have:

- More than 64GB VRAM:

  ```bash
  llama-server --fim-qwen-30b-default
  ```

- More than 16GB VRAM:

  ```bash
  llama-server --fim-qwen-7b-default
  ```

- Less than 16GB VRAM:

  ```bash
  llama-server --fim-qwen-3b-default
  ```

- Less than 8GB VRAM:

  ```bash
  llama-server --fim-qwen-1.5b-default
  ```

<details>
  <summary>CPU-only configs</summary>

These are `llama-server` settings for CPU-only hardware. Note that the quality will be significantly lower:

```bash
llama-server \
    -hf ggml-org/Qwen2.5-Coder-1.5B-Q8_0-GGUF \
    --port 8012 -ub 512 -b 512 --ctx-size 0 --cache-reuse 256
```

```bash
llama-server \
    -hf ggml-org/Qwen2.5-Coder-0.5B-Q8_0-GGUF \
    --port 8012 -ub 1024 -b 1024 --ctx-size 0 --cache-reuse 256
```
</details>

You can use any other FIM-compatible model that your system can handle. By default, models downloaded with the `-hf` flag are stored in:

- Mac OS: `~/Library/Caches/llama.cpp/`
- Linux: `~/.cache/lllama.cpp`
- Windows: `LOCALAPPDATA`

### Recommended LLMs

The plugin requires FIM-compatible models: [HF collection](https://huggingface.co/collections/ggml-org/llamavim-6720fece33898ac10544ecf9)

---

## Download the Latest Build

Every push to `main`/`master` automatically builds and publishes a ready-to-install `.vsix` via GitHub Actions.

**Download:** go to the [Releases page](https://github.com/arcv/llama.vscode.fim/releases/tag/latest) and grab `llama-vscode-fim-<version>.vsix`, then install it:

```bash
code --install-extension llama-vscode-fim-0.0.45.vsix
```

Or from the VS Code UI: Extensions view (`Ctrl+Shift+X`) → `···` menu → **Install from VSIX…**

> The version in the filename always matches the `version` field in `package.json`. Tagged releases (`v*`) also produce a numbered release with auto-generated changelog notes.

---

## Building the Extension

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm v9 or later
- [Visual Studio Code](https://code.visualstudio.com/) v1.100.0 or later
- TypeScript (`npm install -g typescript`)
- `vsce` — the VS Code Extension CLI (`npm install -g @vscode/vsce`)

### 1. Clone and install dependencies

```bash
git clone https://github.com/arcv/llama.vscode.fim
cd llama.vscode.fim
npm install
```

### 2. Compile TypeScript

Compile the extension once:

```bash
npm run compile
```

Or watch for changes during development (recompiles on every file save):

```bash
npm run watch
```

The compiled output lands in the `dist/` directory.

### 3. Run in development mode (Extension Development Host)

The easiest way to test without packaging:

1. Open the repository folder in VS Code:
   ```bash
   code .
   ```
2. Press `F5` (or go to **Run → Start Debugging**).

VS Code will launch a new **Extension Development Host** window with the extension loaded. Any changes you make after recompiling (or while `npm run watch` is running) take effect after reloading the host window with `Ctrl+Shift+P → Developer: Reload Window`.

### 4. Run tests

```bash
npm test
```

This compiles the project and runs the Mocha test suite inside a VS Code test host via `@vscode/test-electron`.

### 5. Package as a `.vsix` file

To produce a self-contained installable package:

```bash
vsce package
```

This generates a file like `llama-vscode-fim-0.0.45.vsix` in the project root.

> **Note:** `vsce` will warn if the `repository` field in `package.json` points to a non-existent URL or if there are missing fields. Fix any warnings before distributing.

### 6. Install the `.vsix` into VS Code

**From the command line:**

```bash
code --install-extension llama-vscode-fim-0.0.45.vsix
```

**From the VS Code UI:**

1. Open the Extensions view (`Ctrl+Shift+X`).
2. Click the **`···`** menu (top-right of the Extensions panel).
3. Select **Install from VSIX…**
4. Browse to the generated `.vsix` file and confirm.

Reload VS Code when prompted. The status bar will show `✓ llama.vscode.fim` once the extension activates.

---

## Quick Start after Installation

1. Start your llama-server with a Qwen FIM model (see [llama.cpp settings](#llamacpp-settings) above).
2. Open the extension menu (`Ctrl+Shift+M`) and select **Completion models… → Select/start completion model**.
3. Pick or add your model endpoint (`http://127.0.0.1:8012` by default).
4. Start typing — completions appear automatically. Press `Tab` to accept.

---

## Configuration

Key settings available in VS Code Settings (`llama-vscode-fim` prefix):

| Setting | Default | Description |
|---|---|---|
| `endpoint` | `http://127.0.0.1:8012` | URL of your llama.cpp server |
| `ai_model` | `""` | Model name for the completion endpoint |
| `debounce_ms` | `0` | Delay (ms) before requesting completion after typing stops |
| `n_prefix` | `256` | Number of prefix lines sent as context |
| `n_suffix` | `64` | Number of suffix lines sent as context |
| `n_predict` | `128` | Max tokens to generate |
| `max_parallel_completions` | `3` | Number of parallel completions (cycle with Alt+] / Alt+[) |
| `debug_log_enabled` | `true` | Enable or disable debug log output |
| `debug_log_level` | `1` (INFO) | Minimum log level: 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR |
| `debug_log_to_file` | `true` | Write logs to a file in the extension log directory |
| `completion_models_list` | `[]` | List of configured completion models |

## Keybindings

| Shortcut | Action |
|---|---|
| `Tab` | Accept suggestion |
| `Shift + Tab` | Accept first line of suggestion |
| `Ctrl + Right` | Accept first word of suggestion |
| `Ctrl + L` | Trigger inline completion manually |
| `Ctrl + Shift + L` | Trigger non-cached completion |
| `Alt + ]` | Next suggestion |
| `Alt + [` | Previous suggestion |
| `Ctrl + Shift + M` | Open llama-vscode-fim menu |
| `Ctrl + Shift + ,` | Copy chunks (debug) |

## License

MIT License

Copyright (c) 2026 llama.vscode.fim contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.