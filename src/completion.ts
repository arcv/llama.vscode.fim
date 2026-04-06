import { Application } from "./application";
import { LlamaResponse, InfillResponseItem } from "./types";
import axios from "axios";
import vscode from "vscode";
import { Utils } from "./utils";

interface CompletionDetails {
    completions: string[];
    position: vscode.Position;
    inputPrefix: string;
    inputSuffix: string;
    prompt: string;
    complIndex: number;
}

export class Completion {
    private app: Application
    isForcedNewRequest = false
    lastCompletion: CompletionDetails = { completions: [], complIndex: 0, position: new vscode.Position(0, 0), inputPrefix: "", inputSuffix: "", prompt: "" };
    private lastRequestTimer = 0

    constructor(application: Application) {
        this.app = application;
    }

    // Class field is used instead of a function to make "this" available
    getCompletionItems = async (
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[] | null> => {
        let group = "GET_COMPLETION_" + Date.now();
        const startTime = Date.now();

        // Update the class-level timer so newer requests can invalidate this one
        this.lastRequestTimer = startTime;

        if (!this.app.configuration.auto && context.triggerKind == vscode.InlineCompletionTriggerKind.Automatic) {
            return null;
        }

        // Gather local context synchronously before entering the async block
        const prefixLines = Utils.getPrefixLines(document, position, this.app.configuration.n_prefix);
        const suffixLines = Utils.getSuffixLines(document, position, this.app.configuration.n_suffix);
        const lineText = document.lineAt(position.line).text;
        const cursorIndex = position.character;
        const linePrefix = lineText.slice(0, cursorIndex);
        const lineSuffix = lineText.slice(cursorIndex);

        if (context.triggerKind == vscode.InlineCompletionTriggerKind.Automatic && lineSuffix.length > this.app.configuration.max_line_suffix) {
            this.app.logger.addEventLog(group, "TOO_LONG_SUFFIX_RETURN", "");
            return null;
        }

        let prompt = linePrefix;
        let spacesToRemove = 0;
        if (this.isOnlySpacesOrTabs(prompt)) {
            prompt = "";
            spacesToRemove = linePrefix.length;
        }
        const inputPrefix = prefixLines.join('\n') + '\n';
        const inputSuffix = lineSuffix + '\n' + suffixLines.join('\n') + '\n';

        // Use the debounce setting to wait for a pause in typing
        const debounceMs = this.app.configuration.debounce_ms || 150;

        // Return a promise that handles the deferred execution
        return new Promise((resolve) => {
            setTimeout(async () => {
                // Check if a newer request started or VS Code cancelled this one during the timeout
                if (token.isCancellationRequested || this.lastRequestTimer !== startTime) {
                    this.app.logger.addEventLog(group, "CANCELLATION_TOKEN_RETURN", "superseded by newer request");
                    return resolve(null);
                }

                try {
                    let data: LlamaResponse | InfillResponseItem | InfillResponseItem[] | undefined;
                    let hashKey = this.app.lruResultCache.getHash(inputPrefix + "|" + inputSuffix + "|" + prompt);
                    let completions = this.getCachedCompletion(hashKey, inputPrefix, inputSuffix, prompt);
                    let isCachedResponse = !this.isForcedNewRequest && completions != undefined;

                    if (!isCachedResponse) {
                        this.isForcedNewRequest = false;
                        this.app.statusbar.showThinkingInfo();

                        // Request completion from the server
                        data = await this.app.llamaServer.getFIMCompletion(inputPrefix, inputSuffix, prompt);

                        // Critical check: Did a new request come in while we were waiting for the server?
                        if (token.isCancellationRequested || this.lastRequestTimer !== startTime) {
                            return resolve(null);
                        }

                        if (data != undefined) completions = this.getComplFromContent(data);
                        else completions = undefined;
                    }

                    if (completions == undefined || completions.length == 0) {
                        this.app.statusbar.showInfo(undefined);
                        this.app.logger.addEventLog(group, "NO_SUGGESTION_RETURN", "");
                        return resolve([]);
                    }

                    let newCompletions: string[] = [];
                    let firstComplLines: string[] = [];

                    for (let compl of completions) {
                        let suggestionLines = compl.split(/\r?\n/);
                        Utils.removeTrailingNewLines(suggestionLines);

                        if (this.shouldDiscardSuggestion(suggestionLines, document, position, linePrefix, lineSuffix)) {
                            continue;
                        } else {
                            compl = this.updateSuggestion(suggestionLines, lineSuffix);
                            newCompletions.push(compl);
                            if (firstComplLines.length == 0) firstComplLines = suggestionLines;
                        }
                    }

                    if (newCompletions.length == 0) {
                        this.app.statusbar.showInfo(undefined);
                        this.app.logger.addEventLog(group, "DISCARD_SUGGESTION_RETURN", "");
                        return resolve([]);
                    }

                    // Store results and update state
                    if (!isCachedResponse) this.app.lruResultCache.put(hashKey, newCompletions);
                    this.lastCompletion = this.getCompletionDetails(newCompletions, position, inputPrefix, inputSuffix, prompt);

                    // Update UI and trigger background caching
                    if (isCachedResponse) {
                        this.app.statusbar.showCachedInfo();
                    } else {
                        this.app.statusbar.showInfo(data);
                    }

                    if (!token.isCancellationRequested && lineSuffix.trim() === "") {
                        // Background tasks are not awaited to keep the response snappy
                        this.cacheFutureSuggestion(inputPrefix, inputSuffix, prompt, firstComplLines);
                        this.cacheFutureAcceptLineSuggestion(inputPrefix, inputSuffix, prompt, firstComplLines);
                    }

                    if (!token.isCancellationRequested) {
                        this.app.extraContext.addFimContextChunks(position, context, document);
                    }

                    this.app.logger.addEventLog(group, "NORMAL_RETURN", firstComplLines[0]);
                    return resolve(this.getCompletion(newCompletions, position, linePrefix, lineSuffix, spacesToRemove));

                } catch (err: any) {
                    if (axios.isCancel(err)) {
                        this.app.logger.addEventLog(group, "ABORTED_BY_NEW_REQUEST", "");
                        return resolve([]);
                    }
                    console.error("Error fetching llama completion:", err);
                    let errorMessage = err instanceof Error ? err.message : "Error fetching completion";
                    this.app.logger.addEventLog(group, "ERROR_RETURN", errorMessage);
                    return resolve([]);
                }
            }, debounceMs);
        });
    };

    private isOnlySpacesOrTabs = (str: string): boolean => {
        // Regular expression to match only spaces and tabs
        return /^[ \t]*$/.test(str);
    }

    private removeLeadingSpaces = (str: string, n: number): string => {
        let i = 0;
        // Count up to 'n' leading spaces
        while (i < str.length && i < n && str[i] === ' ' || str[i] === '\t') {
            i++;
        }

        return str.slice(i);
    }

    private getCachedCompletion = (hashKey: string, inputPrefix: string, inputSuffix: string, prompt: string) => {
        let result = this.app.lruResultCache.get(hashKey);
        if (result != undefined) return result
        for (let i = prompt.length; i >= 0; i--) {
            let newPrompt = prompt.slice(0, i)
            let promptCut = prompt.slice(i)
            let hash = this.app.lruResultCache.getHash(inputPrefix + "|" + inputSuffix + "|" + newPrompt)
            let result = this.app.lruResultCache.get(hash)
            if (result == undefined) continue
            let completions: string[] = []
            for (const compl of result) {
                if (compl && promptCut == compl.slice(0, promptCut.length)) {
                    completions.push(compl.slice(prompt.length - newPrompt.length))
                }
            }
            if (completions.length > 0) return completions;
        }

        return undefined
    }

    /**
     * Compute the replacement range for a single-line mid-cursor completion.
     *
     * When the cursor sits inside a line (lineSuffix is non-empty) we want the
     * suggestion to replace only the text that logically "belongs" to the
     * inserted value and not accidentally swallow trailing punctuation that
     * should stay (closing quote, paren, bracket, etc.).
     *
     * Strategy:
     *   1. The completion must be single-line (multi-line completions are
     *      returned with a point range — no suffix replacement).
     *   2. We look for the longest suffix of the completion text that is also a
     *      prefix of `lineSuffix`. That overlap is the part the model "filled
     *      in up to" the existing suffix, so we skip it in the replacement
     *      range end-point (i.e. we do NOT re-insert those chars).
     *   3. If there is no overlap the replace range ends right at the cursor
     *      (same as inserting), so existing behaviour is preserved.
     *
     * Example:
     *   linePrefix  = `    print("### Start `
     *   lineSuffix  = `")`
     *   suggestion  = `Hello World")`   ← model echoed the closing chars
     *   overlap     = `")`  (len 2)
     *   insertText  = `Hello World`     ← without the echoed overlap
     *   replaceEnd  = cursor + 2        ← consumes `")` from the document
     */
    /**
     * When single-line mode is active, strip everything after the first
     * newline so only the first line of the model's response is used.
     */
    private enforceLineLimit(completion: string): string {
        if (!this.app.configuration.single_line_completion) return completion;
        const newlineIdx = completion.indexOf('\n');
        return newlineIdx === -1 ? completion : completion.slice(0, newlineIdx);
    }

    private computeSuffixReplaceRange(
        completion: string,
        position: vscode.Position,
        lineSuffix: string,
    ): { insertText: string; range: vscode.Range } {
        // Only apply suffix-replace for single-line completions while the
        // cursor is mid-line.  Multi-line suggestions keep a point range.
        const isMidLine = lineSuffix.length > 0;
        const isSingleLine = !completion.includes('\n');

        if (!isMidLine || !isSingleLine) {
            return {
                insertText: completion,
                range: new vscode.Range(position, position),
            };
        }

        // Find the longest suffix of `completion` that matches a prefix of
        // `lineSuffix`, so we know how many existing chars the model echoed.
        let overlapLen = 0;
        const maxCheck = Math.min(completion.length, lineSuffix.length);
        for (let n = maxCheck; n >= 1; n--) {
            if (completion.endsWith(lineSuffix.slice(0, n))) {
                overlapLen = n;
                break;
            }
        }

        const insertText = overlapLen > 0
            ? completion.slice(0, -overlapLen)   // strip the echoed suffix
            : completion;

        // Replace from cursor up to (but not past) the overlap boundary in
        // the document, so the closing chars aren't duplicated.
        const replaceEnd = position.translate(0, overlapLen);

        return {
            insertText,
            range: new vscode.Range(position, replaceEnd),
        };
    }

    getCompletion = (
        completions: string[],
        position: vscode.Position,
        linePrefix: string,
        lineSuffix: string,
        spacesToRemove: number
    ): vscode.InlineCompletionItem[] => {
        const completionItems: vscode.InlineCompletionItem[] = [];

        for (let completion of completions) {
            // In single-line mode keep only the first line of the suggestion
            completion = this.enforceLineLimit(completion);
            if (!completion) continue;

            // Strip the linePrefix duplicate if the model echoed it back
            if (linePrefix.trim() !== "" && completion.startsWith(linePrefix)) {
                completion = completion.slice(linePrefix.length);
            } else {
                // Fallback: remove leading indentation for new-line suggestions
                completion = this.removeLeadingSpaces(completion, spacesToRemove);
            }

            // Compute the replacement range, accounting for a shared suffix
            // between the completion and the existing lineSuffix so we don't
            // duplicate closing quotes, parens, brackets, etc.
            const { insertText, range } = this.computeSuffixReplaceRange(
                completion, position, lineSuffix,
            );

            completionItems.push(new vscode.InlineCompletionItem(insertText, range));
        }

        return completionItems;
    };

    private getCompletionDetails = (completions: string[], position: vscode.Position, inputPrefix: string, inputSuffix: string, prompt: string) => {
        return { completions: completions, complIndex: 0, position: position, inputPrefix: inputPrefix, inputSuffix: inputSuffix, prompt: prompt };
    }

    // logic for discarding predictions that repeat existing text
    shouldDiscardSuggestion = (suggestionLines: string[], document: vscode.TextDocument, position: vscode.Position, linePrefix: string, lineSuffix: string) => {
        let discardSuggestion = false;
        if (suggestionLines.length == 0) return true;
        // truncate the suggestion if the first line is empty
        if (suggestionLines.length == 1 && suggestionLines[0].trim() == "") return true;

        // if cursor on the last line don't discard
        if (position.line == document.lineCount - 1) return false;

        // ... and the next lines are repeated
        if (suggestionLines.length > 1
            && (suggestionLines[0].trim() == "" || suggestionLines[0].trim() == lineSuffix.trim())
            && suggestionLines.slice(1).every((value, index) => value === document.lineAt((position.line + 1) + index).text))
            return true;

        // truncate the suggestion if it repeats the suffix
        if (suggestionLines.length == 1 && suggestionLines[0] == lineSuffix) return true;

        // find the first non-empty line (strip whitespace)
        let firstNonEmptyDocLine = position.line + 1;
        while (firstNonEmptyDocLine < document.lineCount && document.lineAt(firstNonEmptyDocLine).text.trim() === "")
            firstNonEmptyDocLine++;

        // if all lines to the end of file are empty don't discard
        if (firstNonEmptyDocLine >= document.lineCount) return false;

        if (linePrefix + suggestionLines[0] === document.lineAt(firstNonEmptyDocLine).text) {
            // truncate the suggestion if it repeats the next line
            if (suggestionLines.length == 1) return true;

            // ... or if the second line of the suggestion is the prefix of line l:cmp_y + 1
            if (suggestionLines.length === 2
                && suggestionLines[1] == document.lineAt(firstNonEmptyDocLine + 1).text.slice(0, suggestionLines[1].length))
                return true;

            // ... or if the middle chunk of lines of the suggestion is the same as the following non empty lines of the document
            if (suggestionLines.length > 2 && suggestionLines.slice(1).every((value, index) => value === document.lineAt((firstNonEmptyDocLine + 1) + index).text))
                return true;
        }
        return discardSuggestion;
    }

    // cut part of the completion in some special cases
    updateSuggestion = (suggestionLines: string[], lineSuffix: string) => {
        if (suggestionLines.length > 0 && suggestionLines[0].trim() == "") {
            suggestionLines.splice(0, 1);
        }

        if (suggestionLines.length === 0) return "";

        let firstLine = suggestionLines[0];

        // Trim the suffix if the suggestion repeats what is already after the cursor.
        // Note: do NOT strip here for mid-line completions — computeSuffixReplaceRange
        // handles the overlap at the range level, so stripping here would cause the
        // model-echoed closing chars to vanish entirely rather than being replaced.
        if (lineSuffix.trim() === "") {
            if (firstLine.endsWith(lineSuffix) && lineSuffix.length > 0) {
                firstLine = firstLine.slice(0, -lineSuffix.length);
            }
        }

        // Replace the first line in the array with our trimmed version
        suggestionLines[0] = firstLine;

        return suggestionLines.join("\n");
    }

    private cacheFutureSuggestion = async (inputPrefix: string, inputSuffix: string, prompt: string, suggestionLines: string[]) => {
        let futureInputPrefix = inputPrefix;
        let futureInputSuffix = inputSuffix;
        let futurePrompt = prompt + suggestionLines[0];
        if (suggestionLines.length > 1) {
            futureInputPrefix = inputPrefix + prompt + suggestionLines.slice(0, -1).join('\n') + '\n';
            futurePrompt = suggestionLines[suggestionLines.length - 1];
            let futureInputPrefixLines = futureInputPrefix.slice(0, -1).split(/\r?\n/)
            if (futureInputPrefixLines.length > this.app.configuration.n_prefix) {
                futureInputPrefix = futureInputPrefixLines.slice(futureInputPrefixLines.length - this.app.configuration.n_prefix).join('\n') + '\n';
            }
        }
        let futureHashKey = this.app.lruResultCache.getHash(futureInputPrefix + "|" + futureInputSuffix + "|" + futurePrompt)
        let cached_completion = this.app.lruResultCache.get(futureHashKey)
        if (cached_completion != undefined) return;
        let futureData = await this.app.llamaServer.getFIMCompletion(futureInputPrefix, futureInputSuffix, futurePrompt);
        let futureSuggestions = [];
        if (futureData != undefined) {
            let suggestions = this.getComplFromContent(futureData);
            for (let futureSuggestion of suggestions || []) {
                if (!futureSuggestion.trim()) continue;
                let suggestionLines = futureSuggestion.split(/\r?\n/)
                Utils.removeTrailingNewLines(suggestionLines);
                futureSuggestion = suggestionLines.join('\n')
                futureSuggestions.push(futureSuggestion)
            }
            let futureHashKey = this.app.lruResultCache.getHash(futureInputPrefix + "|" + futureInputSuffix + "|" + futurePrompt);
            this.app.lruResultCache.put(futureHashKey, futureSuggestions);
        }
    }

    private cacheFutureAcceptLineSuggestion = async (inputPrefix: string, inputSuffix: string, prompt: string, suggestionLines: string[]) => {
        // For one line suggestion there is nothing to cache
        if (suggestionLines.length > 1) {
            let futureInputSuffix = inputSuffix;
            let futureInputPrefix = inputPrefix + prompt + suggestionLines[0] + '\n';
            let futurePrompt = "";
            let futureHashKey = this.app.lruResultCache.getHash(futureInputPrefix + "|" + futureInputSuffix + "|" + futurePrompt)
            let futureSuggestion = suggestionLines.slice(1).join('\n')
            let cached_completion = this.app.lruResultCache.get(futureHashKey)
            if (cached_completion != undefined) return;
            else this.app.lruResultCache.put(futureHashKey, [futureSuggestion])
        }
    }

    insertNextWord = async (editor: vscode.TextEditor) => {
        // Retrieve the last inline completion item
        const lastSuggestion = this.lastCompletion.completions[this.lastCompletion.complIndex];
        if (!lastSuggestion) {
            return;
        }
        let lastSuggestioLines = lastSuggestion.split(/\r?\n/)
        let firstLine = lastSuggestioLines[0];
        let prefix = Utils.getLeadingSpaces(firstLine)
        let firstWord = prefix + firstLine.trimStart().split(' ')[0] || '';
        let insertText = firstWord

        if (firstWord === "" && lastSuggestioLines.length > 1) {
            let secondLine = lastSuggestioLines[1];
            prefix = Utils.getLeadingSpaces(secondLine)
            firstWord = prefix + secondLine.trimStart().split(' ')[0] || '';
            insertText = '\n' + firstWord
        }

        // Insert the first word at the cursor
        const position = editor.selection.active;
        await editor.edit(editBuilder => {
            editBuilder.insert(position, insertText);
        });
    }

    insertFirstLine = async (editor: vscode.TextEditor) => {
        const lastItem = this.lastCompletion.completions[this.lastCompletion.complIndex];
        if (!lastItem) return;

        let lastSuggestioLines = lastItem.split('\n');
        let insertLine = lastSuggestioLines[0] || '';

        if (insertLine.trim() == "" && lastSuggestioLines.length > 1) {
            insertLine = '\n' + lastSuggestioLines[1];
        }

        const position = editor.selection.active;
        const linePrefix = editor.document.lineAt(position.line).text.slice(0, position.character);

        await editor.edit(editBuilder => {
            // If the line we are about to insert already starts with what's on the editor...
            if (linePrefix.length > 0 && insertLine.startsWith(linePrefix)) {
                // Replace the existing prefix with the full line from the suggestion
                editBuilder.replace(new vscode.Range(position.with(undefined, 0), position), insertLine);
            } else {
                editBuilder.insert(position, insertLine);
            }
        });
    }

    increaseSuggestionIndex = async () => {
        const totalCompletions = this.lastCompletion.completions.length
        if (totalCompletions > 0) {
            this.lastCompletion.complIndex = (this.lastCompletion.complIndex + 1) % totalCompletions
        }
    }

    decreaseSuggestionIndex = async () => {
        const totalCompletions = this.lastCompletion.completions.length
        if (totalCompletions > 0) {
            if (this.lastCompletion.complIndex > 0) this.lastCompletion.complIndex--
            else this.lastCompletion.complIndex = totalCompletions - 1
        }
    }

    private getComplFromContent(codeCompletions: any): string[] | undefined {
        if ("content" in codeCompletions)
            return [codeCompletions.content ?? ""]

        if (codeCompletions.length > 0) {
            let completions: Set<string> = new Set()
            for (const compl of codeCompletions) {
                completions.add(compl.content ?? "")
            }
            return Array.from(completions);
        }
        else return [];
    }
}