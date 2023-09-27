import path from "path";
import { describe, expect, it } from "vitest";
import { CoqLspClient } from "../src/coqlspclient/coqLspClient";
import { readFileSync } from 'fs';
import { ProgressBar } from "../src/coqlspclient/progressBar";
import assert from "assert";


describe('CoqLspClient', () => {
    it('get Fleche document', async () => {
        const filePath = path.join(__dirname, 'resources', 'test1.v');
        
        const absFilePath = path.resolve(filePath);
        const absParentDir = path.resolve(path.join(__dirname, 'resources'));

        const rootDirUri = `file://${absParentDir}`;
        const fileUri = `file://${absFilePath}`;

        const client = new CoqLspClient(rootDirUri);
        const text = readFileSync(filePath).toString()

        await client.didOpen({
            textDocument: {
                uri: fileUri,
                text: text,
                version: 1,
                languageId: 'coq'
            }
        });

        const doc = await client.getDocument({
            textDocument: {
                uri: fileUri
            }
        });

        expect(doc.completed.status).toBe('Yes');
        expect(doc.completed.range).toEqual({
            start: { line: 11, character: 4 },
            end: { line: 11, character: 4 }
        });    
        expect(doc.spans).toHaveLength(14);

        client.shutdown();
        client.exit();
    });

    it('Test progress when opening document', async () => {
        const filePath = path.join(__dirname, 'resources', 'test_basics_sf.v');
        
        const absFilePath = path.resolve(filePath);
        const absParentDir = path.resolve(path.join(__dirname, 'resources'));

        const rootDirUri = `file://${absParentDir}`;
        const fileUri = `file://${absFilePath}`;

        const buffer: number[] = [];
        const progressBar = new ProgressBar(
            (progress: number) => buffer.push(progress),
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            (_: number) => ({}),
            () => ({}),
        );

        const client = new CoqLspClient(rootDirUri, progressBar);
        const text = readFileSync(filePath).toString()

        await client.didOpen({
            textDocument: {
                uri: fileUri,
                text: text,
                version: 1,
                languageId: 'coq'
            }
        });

        expect(buffer.length).toBeGreaterThan(4);
        
        let isSorted = true;
        for (let i = 0; i < buffer.length - 1; i++) {
            if (buffer[i] > buffer[i + 1]) {
                isSorted = false;
                break;
            }
        }
        expect(isSorted).toBe(true);

        client.shutdown();
        client.exit();
    });

    it('Test openDoc changeDoc not timeout', async () => {
        const filePath = path.join(__dirname, 'resources', 'test_basics_sf.v');
        
        const absFilePath = path.resolve(filePath);
        const absParentDir = path.resolve(path.join(__dirname, 'resources'));

        const rootDirUri = `file://${absParentDir}`;
        const fileUri = `file://${absFilePath}`;

        const client = new CoqLspClient(rootDirUri);
        const text = readFileSync(filePath).toString()

        await client.didOpen({
            textDocument: {
                uri: fileUri,
                text: text,
                version: 1,
                languageId: 'coq'
            }
        });

        await client.didChange({
            textDocument: {
                uri: fileUri,
                version: 2
            }, 
            contentChanges: [{
                text: text + "\n Print nat."
            }]
        });

        expect(1).toBe(1);

        client.shutdown();
        client.exit();
    }, 1500);

    it('Test getGoals small no dependecies', async () => {  
        const filePath = path.join(__dirname, 'resources', 'test1.v');
        const absFilePath = path.resolve(filePath);
        const absParentDir = path.resolve(path.join(__dirname, 'resources'));

        const rootDirUri = `file://${absParentDir}`;
        const fileUri = `file://${absFilePath}`;

        const client = new CoqLspClient(rootDirUri);
        const text = readFileSync(filePath).toString()

        await client.didOpen({
            textDocument: {
                uri: fileUri,
                text: text,
                version: 1,
                languageId: 'coq'
            }
        });

        const positions = [
            { line: 2, character: 4 },
            { line: 2, character: 14 },
            { line: 8, character: 4 },
        ]

        const goalTys = [
            "forall n : nat, 0 + n = n",
            "0 + n = n",
            "forall n : nat, 0 + n + 0 = n"
        ]

        for (let i = 0; i < positions.length; i++) {
            const goals = await client.getGoals({
                textDocument: {
                    uri: fileUri,
                    version: 1
                }, 
                position: positions[i]
            });

            expect(goals.goals === null).toBe(false);
            assert(goals.goals !== null);
            expect(goals.goals.goals.length).toBeGreaterThan(0);
            expect(goals.goals.goals[0].ty).toEqual(goalTys[i]);
        }

        client.shutdown();
        client.exit();
    });

    it('Test getGoals big no dependecies', async () => {  
        const filePath = path.join(__dirname, 'resources', 'test_basics_sf.v');
        const absFilePath = path.resolve(filePath);
        const absParentDir = path.resolve(path.join(__dirname, 'resources'));

        const rootDirUri = `file://${absParentDir}`;
        const fileUri = `file://${absFilePath}`;

        const progressBar = new ProgressBar(
            (progress: number) => console.log("Upgrade: ", progress),
            (total: number) => console.log("Total: ", total),
            () => ({}),
        );

        const client = new CoqLspClient(rootDirUri, progressBar);
        const text = readFileSync(filePath).toString()

        await client.didOpen({
            textDocument: {
                uri: fileUri,
                text: text,
                version: 1,
                languageId: 'coq'
            }
        });

        const positions = [
            { line: 1495, character: 2 },
            { line: 1909, character: 2 },
            { line: 2028, character: 4 },
        ]

        const goalTys = [
            "f (f b0) = b0",
            "double 0 = 0 + 0",
            "n + m = m + n"
        ]

        for (let i = 0; i < positions.length; i++) {
            const goals = await client.getGoals({
                textDocument: {
                    uri: fileUri,
                    version: 1
                }, 
                position: positions[i]
            });

            expect(goals.goals === null).toBe(false);
            assert(goals.goals !== null);

            expect(goals.goals.goals.length).toBeGreaterThan(0);
            expect(goals.goals.goals[0].ty).toEqual(goalTys[i]);
        }

        client.shutdown();
        client.exit();
    });

    it('Test getGoals big with dependecies', async () => {  
        // Define a path to imm/src/basic/Execution.v here
        const absFilePath = undefined
        const absParentDir = undefined

        if (absFilePath === undefined || absParentDir === undefined) {
            return;
        }

        const rootDirUri = `file://${absParentDir}`;
        const fileUri = `file://${absFilePath}`;

        const client = new CoqLspClient(rootDirUri);
        const text = readFileSync(absFilePath).toString()

        await client.didOpen({
            textDocument: {
                uri: fileUri,
                text: text,
                version: 1,
                languageId: 'coq'
            }
        });

        const positions = [
            { line: 345, character: 2 },
            { line: 482, character: 2 },
            { line: 975, character: 0 },
            { line: 1081, character: 4 },
            { line: 1293, character: 4 },
        ]

        const goalTys = [
            "well_founded (⦗E⦘ ⨾ ext_sb ⨾ ⦗E⦘)",
            "⦗set_compl (fun a : actid => is_init a)⦘ ⨾ sb ⊆ same_tid",
            "same_loc ⨾ same_loc ⊆ same_loc",
            "⦗W⦘ ⨾ (⦗F⦘ ⨾ sb)^? ⊆ ⦗fun _ : actid => True⦘",
            "loc x = Some l /\\ loc y = Some l"
        ]

        for (let i = 0; i < positions.length; i++) {
            const goals = await client.getGoals({
                textDocument: {
                    uri: fileUri,
                    version: 1
                }, 
                position: positions[i]
            });
            if (goals.goals === null) { 
                console.log("Error: ", i, positions[i], goalTys[i]);
            }
            expect(goals.goals === null).toBe(false);
            assert(goals.goals !== null);
            
            expect(goals.goals.goals.length).toBeGreaterThan(0);
            expect(goals.goals.goals[0].ty).toEqual(goalTys[i]);
        }

        client.shutdown();
        client.exit();
    }, 50000);
});
