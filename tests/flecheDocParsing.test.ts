import path from "path";
import { describe, expect, it } from "vitest";
import { CoqLspClient } from "../src/coqlspclient/coqLspClient";
import { readFileSync } from 'fs';
import { FlecheExprTree } from "../src/coqlspclient/coqLspModels";


describe('CoqLspModels', () => {
    it('Parse Fleche document', async () => {
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
        let exprs: FlecheExprTree[] = [];
        let indices: number[] = [];
        let i = 0;
        for (const span of doc.spans) {
            if (span.span && 'v' in span.span) {
                const expr = span.span['v']['expr'];
                try {
                    const tree = new FlecheExprTree(expr);
                    exprs.push(tree);
                    indices.push(i);
                } catch (e) {
                    // Skip 
                }
            }
            i++;
        }

        const nodes = exprs[0].dfsListNodeLabels();
        expect(nodes).toHaveLength(67);
        const nodesCorrect = [
            'VernacExtend',
            'VernacSolve',
            '0',
            'GenArg',
            'Rawwit',
            'OptArg',
            'ExtraArg',
            'ltac_selector',
            'GenArg',
            'Rawwit',
            'OptArg',
            'ExtraArg',
            'ltac_info',
            'GenArg',
            'Rawwit',
            'ExtraArg',
            'tactic',
            'v',
            'TacAtom',
            'TacIntroPattern',
            'false',
            'v',
            'IntroNaming',
            'IntroIdentifier',
            'Id',
            'n',
            'loc',
            'fname',
            'InFile',
            'dirpath',
            'file',
            `${filePath}`,
            'line_nb',
            '3',
            'bol_pos',
            '51',
            'line_nb_last',
            '3',
            'bol_pos_last',
            '51',
            'bp',
            '62',
            'ep',
            '63',
            'loc',
            'fname',
            'InFile',
            'dirpath',
            'file',
            `${filePath}`,
            'line_nb',
            '3',
            'bol_pos',
            '51',
            'line_nb_last',
            '3',
            'bol_pos_last',
            '51',
            'bp',
            '55',
            'ep',
            '63',
            'GenArg',
            'Rawwit',
            'ExtraArg',
            'ltac_use_default',
            'false'
        ];
        expect(nodes).toStrictEqual(nodesCorrect);
    });
});
