import { LspClient } from "../lspclient/lspClient";
import { JSONRPCEndpoint } from "../lspclient/jsonRpcEndpoint";
import * as models from "../lspclient/models";
import * as coqModels from "./coqLspModels";
import { ProgressBar, CliProgressBar } from "./progressBar";
import { spawn } from "child_process";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export class CoqLspClient extends LspClient {
    private progBar: ProgressBar;
    private readonly timeout: number = 30;

    constructor(
        rootUri: string, 
        progBar: ProgressBar = new CliProgressBar(), 
    ) {
        const process = spawn(
            "coq-lsp",
            [],
            {
                shell: true,
                stdio: 'pipe'
            }
        );

        const jsonRpcEndpoint = new JSONRPCEndpoint(
            process.stdin,
            process.stdout,
        );

        super(jsonRpcEndpoint);
        this.progBar = progBar;

        const processId: number | null = process.pid === undefined ? null : process.pid;

        this.initialize({
            processId: processId,
            rootPath: "",
            rootUri: rootUri.replace("file://", ""),
            initializationOptions: {
                max_errors: 1500000,
                show_coq_info_messages: true,
                eager_diagnostics: false
            },
            capabilities: {},
            trace: "off",
            workspaceFolders: [{ uri: rootUri.replace("file://", ""), name: "imm" }]
        });

        this.initialized();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public getDiagnostics(): { [uri: string]: any[]; } {
        return this.endpoint.diagnostics;
    }

    public clearDiagnostics(uri: string): void {
        this.endpoint.diagnostics[uri] = [];
    }

    public async didOpen(params: models.DidOpenTextDocumentParams): Promise<void> {
        super.didOpen(params);
        let timeout = this.timeout;
        const amountLines = params.textDocument.text.split("\n").length - 1;
        this.progBar.initialize(amountLines);

        while (timeout > 0) {
            if (this.endpoint.isCompletedOperation()) {
                this.progBar.finish();
                return;
            } else if (this.endpoint.isShutdown()) {
                throw new Error("Coq LSP server has shutdown");
            } else {
                timeout -= 0.1;
                await sleep(100);

                const curProcessLineNullable = this.endpoint.filesProgressLine[params.textDocument.uri];
                const curProcessLine = curProcessLineNullable === undefined ? 0 : curProcessLineNullable;

                this.progBar.updateCount(curProcessLine as number);
            }
        }

        this.progBar.finish();
        this.shutdown();
        this.exit();
        
        throw new Error("Coq LSP server did not respond in time");
    }

    public async didChange(params: models.DidChangeTextDocumentParams): Promise<void> {
        super.didChange(params);
        let timeout = this.timeout;
        while (timeout > 0) {
            if (this.endpoint.isCompletedOperation()) {
                return;
            } else if (this.endpoint.isShutdown()) {
                throw new Error("Coq LSP server has shutdown");
            } else {
                timeout -= 0.1;
                await sleep(100);
            }
        }

        this.shutdown();
        this.exit();

        throw new Error("Coq LSP server did not respond in time");
    }

    public async getDocument(params: coqModels.FlecheDocumentParams): Promise<coqModels.FlecheDocument> {
        /** 
        * The coq/getDocument request returns a serialized version of Fleche's 
        * document. It is modelled after LSP's standard textDocument/documentSymbol, 
        * but returns instead the full document contents as understood by Flèche.
        */
        const serverResponse = await this.endpoint.send("coq/getDocument", params);
        return coqModels.flecheDocFromLsp(serverResponse);
    }

    public async getGoals(params: coqModels.GoalsReqeustParams): Promise<coqModels.GoalAnswer> {
        const serverResponse = await this.endpoint.send("proof/goals", params);
        let messages = serverResponse.messages;

        // As messages is str[] | Message[] we unify it to Message[]
        if (messages.length === 0) {
            messages = [];
        } else if (typeof messages[0] === "string") {
            messages = messages.map((message: string) => ({ text: message }));
        } else {
            messages = messages.map((message: coqModels.Message) => ({
                text: message.text,
                range: message.range === null ? null : {
                    start: message.range.start,
                    end: message.range.end
                },
                level: message.level
            }));
        }

        const goalConfig = serverResponse.goals === null ? null : coqModels.GoalConfig.fromGoalConfigDict(serverResponse.goals);

        return {
            textDocument: params.textDocument,
            position: params.position,
            messages: messages,
            goals: goalConfig, 
            error: null, 
            program: null
        };

    }
}