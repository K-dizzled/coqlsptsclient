/* eslint-disable @typescript-eslint/no-explicit-any */
import { ProgressBar, CliProgressBar } from "./progressBar";
import { CoqLspClient } from "./coqLspClient";
import * as coqModels from "./coqLspModels";
import * as lspModels from "../lspclient/models";
import { SilentExec } from "./silentExec";
import path from "path";
import { 
    readFileSync, openSync, closeSync, 
    unlinkSync, writeFileSync, appendFileSync 
} from "fs";
import * as os from "os";
import assert from "assert";
import {v4 as uuidv4} from "uuid";

export class ProofView {
    private coqLspClient: CoqLspClient;
    private progBar: ProgressBar;
    private readonly path: string;
    private readonly fileUri: string;
    private astFull: coqModels.FlecheDocument | undefined;
    private ast: coqModels.RangedSpan[] | undefined;
    private lines: string[];
    private auxPath: string | null;

    private constructor(
        filePath: string,
        rootPath: string,
        progBar: ProgressBar
    ) {
        const pathToCoqFile = path.resolve(filePath);
        const parentDir = path.resolve(rootPath);

        const rootDirUri = `file://${parentDir}`;
        const fileUri = `file://${pathToCoqFile}`;

        this.path = filePath;
        this.fileUri = fileUri;
        this.progBar = progBar;
        this.auxPath = null;
        this.lines = [];
        this.coqLspClient = new CoqLspClient(rootDirUri, this.progBar);
    }

    static async init(
        filePath: string,
        rootPath: string,
        progBar: ProgressBar = new CliProgressBar()
    ): Promise<ProofView> {
        const proofView = new ProofView(filePath, rootPath, progBar);
        try {
            const text = readFileSync(proofView.path).toString();
            proofView.lines = text.split("\n");

            const textDoc = {
                uri: proofView.fileUri,
                text: text,
                version: 1,
                languageId: 'coq'
            };

            await proofView.coqLspClient.didOpen({ textDocument: textDoc });
            proofView.astFull = await proofView.coqLspClient.getDocument(
                { textDocument: { uri: proofView.fileUri } }
            );

            proofView.ast = proofView.astFull.spans;
        } catch (error) {
            proofView.coqLspClient.shutdown();
            proofView.coqLspClient.exit();
            if (error instanceof Error) {
                throw new Error("Error initializing proof view due to " + error.message);
            }
        }

        return proofView;
    }

    @SilentExec("get_expr", true)
    private getExpr(span: coqModels.RangedSpan): { [key: string]: any } {
      return span.span === null ? null : span.span['v']['expr'];
    }

    @SilentExec("get_theorem_name")
    private getTheoremName(expr: { [key: string]: any }): string {
        return expr[2][0][0][0]['v'][1];
    }

    @SilentExec("get_vernacexpr", true)
    private getVernacexpr(expr: { [key: string]: any }): coqModels.Vernacexpr {
        return expr[0] as coqModels.Vernacexpr;
    }

    @SilentExec("get_proof_end_command", true)
    private getProofEndCommand(expr: { [key: string]: any }): string {
        return expr[1][0];
    }

    private checkIfExprEAdmit(expr: { [key: string]: any }): boolean {
        return this.getProofEndCommand(expr) === 'Admitted';
    }

    private getTextInRange(
        start: lspModels.Position, 
        end: lspModels.Position, 
        preserveLineBreaks = false
    ): string {
        if (start.line === end.line) {
            return this.lines[start.line].substring(start.character, end.character);
        } else {
            let text = this.lines[start.line].substring(start.character);
            for (let i = start.line + 1; i < end.line; i++) {
                if (preserveLineBreaks) {
                    text += '\n';
                }
                text += this.lines[i];
            }
            if (preserveLineBreaks) {
                text += '\n';
            }
            text += this.lines[end.line].substring(0, end.character);

            return text;
        }
    }

    private async parseProof(spanIndex: number): Promise<coqModels.TheoremProof> {
        if (this.ast === undefined) {
            throw new coqModels.ProofViewError("AST is undefined.");
        }

        let index = spanIndex;
        let proven = false;
        const proof: coqModels.ProofStep[] = [];
        let endPos: lspModels.Range | null = null;
        let proofContainsAdmit = false;

        while (!proven && index < this.ast.length) {
            const span = this.ast[index];
            const vernacType = this.getVernacexpr(this.getExpr(span));
            if (vernacType === coqModels.Vernacexpr.VernacEndProof || vernacType === coqModels.Vernacexpr.VernacAbort) {
                const proofStep = new coqModels.ProofStep(
                    this.getTextInRange(span.range.start, span.range.end),
                    null,
                    vernacType
                );
                proof.push(proofStep);
                proven = true;
                endPos = span.range;
                // I assume when proof has some admitted parts it has either Admitted or Abort in the end
                // Isn't that right?
                if (this.checkIfExprEAdmit(this.getExpr(span)) || vernacType === coqModels.Vernacexpr.VernacAbort) {
                    proofContainsAdmit = true;
                }
            } else {
                const goalAns = await this.coqLspClient.getGoals({
                    textDocument: { uri: this.fileUri, version: 1 }, 
                    position: span.range.end
                });
                let proofStepFocusedGoal: coqModels.Goal | null = null;
                if (goalAns.goals !== null) {
                    if (goalAns.goals.goals.length > 0) {
                        proofStepFocusedGoal = goalAns.goals.goals[0];
                    }
                } else {
                    console.warn("No goals found for proof step");
                }

                const proofStep = new coqModels.ProofStep(
                    this.getTextInRange(span.range.start, span.range.end),
                    proofStepFocusedGoal,
                    vernacType
                );

                proof.push(proofStep);
                index += 1;
            }
        }

        if (!proven || endPos === null) {
            throw new coqModels.ProofViewError("Invalid or incomplete proof.");
        }

        const proofObj = new coqModels.TheoremProof(proof, endPos, proofContainsAdmit);
        return proofObj;
    }

    private createAuxFile() {
        const dir = os.tmpdir();
        const fileBase: string[] = path.parse(this.path).base.split('.');
        assert(fileBase.length === 2);

        const fileName = fileBase[0]; 
        const fileFormat = fileBase[1];

        const fileUuid: string = fileName + uuidv4();
        const newFileName = fileUuid.replace(/-/g, '') + '.' + fileFormat;
        this.auxPath = path.join(dir, newFileName);

        closeSync(openSync(this.auxPath, 'w'));
    }

    async checkProof(
        thrStatement: string, 
        proof: string, 
        precedingContext: string
    ): Promise<[boolean, string | null]> {
        /**
         * Checks if the given proof is valid for the given theorem statement.
         * Returns a tuple of a boolean and an optional string. The boolean is 
         * True if the proof is valid, False otherwise.
         * The optional string is None if the proof is valid, otherwise it is a
         * string containing the error message.
         */
        this.createAuxFile();
        const auxFileText = precedingContext + '\n\n' + thrStatement + '\n' + proof;
        if (this.auxPath === null) {
            throw new coqModels.ProofViewError("Auxiliary file is already created.");
        }
        writeFileSync(this.auxPath, auxFileText, { flag: 'w' });

        const auxFileUri = `file://${this.auxPath}`;
        await this.coqLspClient.didOpen({
            textDocument: {
                uri: auxFileUri,
                text: auxFileText,
                version: 1,
                languageId: 'coq'
            }
        });

        const diagnostics = this.coqLspClient.getDiagnostics();
        unlinkSync(this.auxPath); 
        this.auxPath = null;

        if (auxFileUri in diagnostics) {
            const newDiags = diagnostics[auxFileUri].filter(
                (diag: { [key: string]: any }) => {
                    return diag.range.start.line >= precedingContext.split('\n').length;
                }
            );

            const errorDiags = newDiags.filter(
                (diag: { [key: string]: any }) => {
                    return diag.severity === 1;
                }
            );

            if (errorDiags.length > 0) {
                return [false, errorDiags[0].message];
            } else {
                // TODO: Better check using vernac Print Assumptions {theorem_name}.
                // Somewhy, I am currently unble to retrieve the messages
                if (proof.includes('Abort.') || proof.includes('Admitted.')) {
                    return [false, "Proof contains 'Abort.' or 'Admitted.'"];
                } else {
                    return [true, null];
                }
            }
        }

        throw new coqModels.ProofViewError("Failed to check proof. Empty diagnostics.");
    }

    async checkProofs(
        precedingContext: string, 
        statement: string,
        proofs: string[]
    ): Promise<[boolean, string | null][]> {
        this.createAuxFile();

        const auxFileText = precedingContext + '\n\n' + statement + '\n';
        if (this.auxPath === null) {
            throw new coqModels.ProofViewError("Auxiliary file is already created.");
        }
        writeFileSync(this.auxPath, auxFileText, { flag: 'w' });

        const auxFileUri = `file://${this.auxPath}`;
        // TODO: log "Start processing file's preceding context.
        await this.coqLspClient.didOpen({
            textDocument: {
                uri: auxFileUri,
                text: auxFileText,
                version: 1,
                languageId: 'coq'
            }
        });
        let documentVersion = 1;
        const proofVerdicts: [boolean, string | null][] = [];

        // TODO: log "Start processing various proofs."
        this.progBar.initialize(proofs.length);

        for (const proof of proofs) {
            const newText = auxFileText + proof;
            documentVersion += 1;
            appendFileSync(this.auxPath, proof);
            const versionedDoc = {
                uri: auxFileUri,
                version: documentVersion
            };
            const contentChanges = [{
                text: newText
            }];

            if (auxFileUri in this.coqLspClient.getDiagnostics()) {
                this.coqLspClient.clearDiagnostics(auxFileUri);
            }
            try {
                await this.coqLspClient.didChange({
                    textDocument: versionedDoc,
                    contentChanges: contentChanges
                });
            } catch (error) {
                throw new coqModels.ProofViewError("Server is not responding.");
            }

            const diagnostics = this.coqLspClient.getDiagnostics();
            writeFileSync(this.auxPath, auxFileText, { flag: 'w' });

            if (auxFileUri in diagnostics) {
                const newDiags = diagnostics[auxFileUri].filter(
                    (diag: { [key: string]: any }) => {
                        return diag.range.start.line >= precedingContext.split('\n').length;
                    }
                );
                const errorDiags = newDiags.filter(
                    (diag: { [key: string]: any }) => {
                        return diag.severity === 1;
                    }
                );
                if (errorDiags.length > 0) {
                    proofVerdicts.push([false, errorDiags[0].message]);
                } else {
                    if (proof.includes('Abort.') || proof.includes('Admitted.')) {
                        proofVerdicts.push([false, "Proof contains 'Abort.' or 'Admitted.'"]);
                    } else {
                        proofVerdicts.push([true, null]);
                        unlinkSync(this.auxPath);
                        this.auxPath = null;
                        this.progBar.finish();

                        return proofVerdicts;
                    }
                }
            } else {
                throw new coqModels.ProofViewError("Error checking proof. Empty file diagnostics.");
            }
            
            this.progBar.increaseCount();
        }

        unlinkSync(this.auxPath);
        this.auxPath = null;
        this.progBar.finish();
        return proofVerdicts;
    }

    async parseFile(): Promise<coqModels.Theorem[]> {
        /**
         * Parses the file and returns a list of theorems.
         * Does the same as: 
         * proofs = [pv.get_proof_by_theorem(thm) for thm in pv.all_theorem_names()]
         * but with better performance.
         */ 
        if (this.ast === undefined) {
            throw new coqModels.ProofViewError("AST is undefined.");
        }
        const theorems: coqModels.Theorem[] = [];
        this.progBar.initialize(this.ast.length);

        for (let i = 0; i < this.ast.length; i++) {
            const span = this.ast[i];
            try {
                if (this.getVernacexpr(this.getExpr(span)) === coqModels.Vernacexpr.VernacStartTheoremProof) {
                    const thrName = this.getTheoremName(this.getExpr(span));
                    const thrStatement = this.getTextInRange(
                        this.ast[i].range.start, 
                        this.ast[i].range.end, 
                        true
                    );
                    const nextExprVernac = this.getVernacexpr(this.getExpr(this.ast[i + 1]));
                    if (i + 1 >= this.ast.length) {
                        theorems.push(new coqModels.Theorem(thrName, this.ast[i].range, thrStatement, null));
                    } else if (![
                        coqModels.Vernacexpr.VernacProof, 
                        coqModels.Vernacexpr.VernacAbort, 
                        coqModels.Vernacexpr.VernacEndProof
                    ].includes(nextExprVernac)) {
                        theorems.push(new coqModels.Theorem(thrName, this.ast[i].range, thrStatement, null));
                    } else {
                        const proof = await this.parseProof(i + 1);
                        theorems.push(new coqModels.Theorem(thrName, this.ast[i].range, thrStatement, proof));
                    }
                }
            } catch (error) {
                // Ignore
            }

            this.progBar.increaseCount();
        }

        this.progBar.finish();
        return theorems;
    }

    async getTheoremByName(theoremName: string): Promise<coqModels.Theorem> {
        /**
         * Returns the proof of the given theorem name.
         * If the theorem is not found, raises an exception.
         * If proof is not present, returns None.
         */
        if (this.ast === undefined) {
            throw new coqModels.ProofViewError("AST is undefined.");
        }
        let found = false;
        let spanPos = 0;
        for (let i = 0; i < this.ast.length; i++) {
            const span = this.ast[i];
            try {
                if (this.getVernacexpr(this.getExpr(span)) === coqModels.Vernacexpr.VernacStartTheoremProof) {
                    if (this.getTheoremName(this.getExpr(span)) === theoremName) {
                        spanPos = i;
                        found = true;
                        break;
                    }
                }
            } catch (error) { /* Ignore */ }
        }

        if (!found) {
            throw new coqModels.ProofViewError(`Theorem ${theoremName} not found.`);
        }

        const thrName = this.getTheoremName(this.getExpr(this.ast[spanPos]));
        const thrStatement = this.getTextInRange(
            this.ast[spanPos].range.start,
            this.ast[spanPos].range.end,
            true
        );

        const nextExprVernac = this.getVernacexpr(this.getExpr(this.ast[spanPos + 1]));
        if (spanPos + 1 >= this.ast.length) {
            console.warn(`Failed to parse proof of ${theoremName}. File ended.`);
            return new coqModels.Theorem(thrName, this.ast[spanPos].range, thrStatement, null);
        } else if (![
            coqModels.Vernacexpr.VernacProof, 
            coqModels.Vernacexpr.VernacAbort, 
            coqModels.Vernacexpr.VernacEndProof
        ].includes(nextExprVernac)) {
            console.warn(`Proof of theorem ${theoremName} is not finished.`);
            return new coqModels.Theorem(thrName, this.ast[spanPos].range, thrStatement, null);
        }

        try {
            const proof = await this.parseProof(spanPos + 1);
            const theorem = new coqModels.Theorem(thrName, this.ast[spanPos].range, thrStatement, proof);
            return theorem;
        } catch (error) {
            throw new coqModels.ProofViewError(`Failed to parse proof of ${theoremName}.`);
        }
    }

    allTheoremNames(): string[] {
        /**
         * Returns a list of all theorem names in the file.
         */
        if (this.ast === undefined) {
            throw new coqModels.ProofViewError("AST is undefined.");
        }
        const theoremNames: string[] = [];
        for (const span of this.ast) {
            try {
                if (this.getVernacexpr(this.getExpr(span)) === coqModels.Vernacexpr.VernacStartTheoremProof) {
                    theoremNames.push(this.getTheoremName(this.getExpr(span)));
                }
            } catch (error) {
                // Ignore
            }
        }

        return theoremNames;
    }

    exit() {
        this.coqLspClient.shutdown();
        this.coqLspClient.exit();
    }
}