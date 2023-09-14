import { describe, it, expect } from "vitest";
import { ProofView } from "../src/coqlspclient/proofView";
import path from "path";
import assert from "assert";

describe('proofView', () => {
    it('test fetch theorems small', async () => {
        const filePath = path.join(__dirname, 'resources', 'test1.v');        
        const parentDir = path.join(__dirname, 'resources');

        const proofView = await ProofView.init(
            filePath,
            parentDir
        );

        const thrs = proofView.allTheoremNames();
        expect(thrs).toEqual(["test_thr", "test_thr1"]);

        proofView.exit();
    });

    it('test fetch theorems big', async () => {
        const filePath = path.join(__dirname, 'resources', 'test_basics_only_sf.v');
        const parentDir = path.join(__dirname, 'resources');

        const proofView = await ProofView.init(
            filePath,
            parentDir
        );

        const thrs = proofView.allTheoremNames();
        expect(thrs.length).toBe(22);
        expect(thrs).toStrictEqual([
            'plus_O_n', "plus_O_n'", "plus_O_n''", 'plus_1_l', 'mult_0_l', 
            'plus_id_example', 'plus_id_exercise', 'mult_n_0_m_0', 
            'mult_n_1', 'plus_1_neq_0_firsttry', 'plus_1_neq_0', 
            'negb_involutive', 'andb_commutative', "andb_commutative'", 
            'andb3_exchange', 'andb_true_elim2', "plus_1_neq_0'", 
            "andb_commutative''", 'zero_nbeq_plus_1', 'identity_fn_applied_twice', 
            'negation_fn_applied_twice', 'andb_eq_orb'
        ]);

        proofView.exit();
    });

    it("test theorem get proof exception", async () => {
        const filePath = path.join(__dirname, 'resources', 'aux.v');
        const parentDir = path.join(__dirname, 'resources');

        const proofView = await ProofView.init(
            filePath,
            parentDir
        );

        proofView.getTheoremByName("test_thr2").catch((error) => {
            expect(error.message).toBe("Theorem test_thr2 not found.");
        });

        proofView.exit();
    });

    it("test theorem get proof small", async () => {
        const filePath = path.join(__dirname, 'resources', 'aux.v');
        const parentDir = path.join(__dirname, 'resources');

        const proofView = await ProofView.init(
            filePath,
            parentDir
        );

        const proof = await proofView.getTheoremByName("test_thr1");
        expect(proof.statement).toBe("Theorem test_thr1 : forall n:nat, 0 + n + 0 = n.");
        expect(proof.proof).toBeDefined();
        assert(proof.proof !== null);
        expect(proof.proof.onlyText()).toBe("Admitted.\n");

        proofView.exit();
    });

    it("test incomplete proofs", async () => {
        const filePath = path.join(__dirname, 'resources', 'test_incomplete_proofs.v');
        const parentDir = path.join(__dirname, 'resources');
        
        const proofView = await ProofView.init(
            filePath,
            parentDir
        );

        const incompleteIndeces = [2, 3, 4, 5, 6];
        const completeIndeces = [1, 8];

        for (const i of incompleteIndeces) {
            const proof = await proofView.getTheoremByName(`test_incomplete_proof${i}`);
            expect(proof.proof).toBeDefined();
            assert(proof.proof !== null);
            expect(proof.proof.is_incomplete).toBe(true);
        }

        for (const i of completeIndeces) {
            const proof = await proofView.getTheoremByName(`test_incomplete_proof${i}`);
            expect(proof.proof).toBeDefined();
            assert(proof.proof !== null);
            expect(proof.proof.is_incomplete).toBe(false);
        }

        proofView.exit();
    });

    it("test theorem get proof more", async () => {
        const filePath = path.join(__dirname, 'resources', 'aux.v');
        const parentDir = path.join(__dirname, 'resources');

        const proofView = await ProofView.init(
            filePath,
            parentDir
        );

        const proof = await proofView.getTheoremByName("test_thr");

        expect(proof.statement).toBe("Theorem test_thr : forall n:nat, 0 + n = n.");
        expect(proof.proof).toBeDefined();
        assert(proof.proof !== null);
        expect(proof.proof.proof_steps.length).toBe(6);
        assert(proof.proof.proof_steps[3] !== null);
        assert(proof.proof.proof_steps[3].focused_goal !== null);
        expect(proof.proof.proof_steps[3].text).toBe("simpl.");
        expect(proof.proof.proof_steps[3].focused_goal.ty).toBe("n = n");
        expect(proof.proof.proof_steps[3].focused_goal.hyps.length).toBe(1);
        expect(proof.proof.proof_steps[3].focused_goal.hyps[0].names[0]).toBe("n");

        proofView.exit();
    });   
    
    it("test check proof simple", async () => {
        const filePath = path.join(__dirname, 'resources', 'aux.v');
        const parentDir = path.join(__dirname, 'resources');
        const proofView = await ProofView.init(filePath, parentDir);

        const precedingContext = "";
        const thrStatement = "Theorem plus_O_n'' : forall n:nat, 0 + n = n.";
        const proof = "Proof. Admitted.";
        const res = await proofView.checkProof(thrStatement, proof, precedingContext);

        expect(res[0]).toBe(false);
        expect(res[1]).toBe("Proof contains 'Abort.' or 'Admitted.'");

        proofView.exit();
    });

    it("test check proofs simple", async () => {
        const filePath = path.join(__dirname, 'resources', 'aux.v');
        const parentDir = path.join(__dirname, 'resources');
        const proofView = await ProofView.init(filePath, parentDir);
        const precedingContext = "";
        const thrStatement = "Theorem plus_O_n'' : forall n:nat, 0 + n = n.";
        const proofs = [
            "Proof. intros n. Qed.",
            "Proof. kek. Qed.",
            "Proof. lol. Qed.",
            "Proof. assumption. Qed.",
            "Proof. Admitted.",
            "Proof. reflexivity. Abort.",
            "Proof. reflexivity. Qed.",
            "Proof. auto. Qed.",
        ];
        const answers = [
            [false, " (in proof plus_O_n''): Attempt to save an incomplete proof"],
            [false, "The reference kek was not found in the current environment."],
            [false, "The reference lol was not found in the current environment."],
            [false, "No such assumption."],
            [false, "Proof contains 'Abort.' or 'Admitted.'"],
            [false, "Proof contains 'Abort.' or 'Admitted.'"],
            [true, null]
        ];

        const res = await proofView.checkProofs(precedingContext, thrStatement, proofs);
        expect(res).toStrictEqual(answers);

        proofView.exit();
    });

    it("test check proofs normal", async () => {
        const filePath = path.join(__dirname, 'resources', 'test_basics_sf.v');
        const parentDir = path.join(__dirname, 'resources');
        const proofView = await ProofView.init(filePath, parentDir);
        const precedingContext = "";
        const thrStatement = "Theorem test_thr1 : forall n:nat, 0 + n + 0 = n.";
        const proofs = [
            "Proof.\nintros n.\nsimpl.\nrewrite plus_0_r.\nreflexivity.\nQed.",
            "Proof.\nintros n.\nsimpl.\nPrint plus.\nrewrite plus_0_r.\nreflexivity.\nQed.",
            "Proof.\nintros n.\nrewrite plus_0_r.\nrewrite plus_0_l.\nreflexivity.\nQed.",
            "Proof.\nintros n.\nsimpl.\nrewrite plus_0_r.\nreflexivity.\nQed.",
            "Proof.\nintros n.\nrewrite <- plus_n_O.\nrewrite <- plus_n_O at 1.\nreflexivity.\nQed.",
            "Proof.\nintros n.\nsimpl.\nrewrite plus_0_r.\nreflexivity.\nQed.",
            "Proof.\nintros n.\nPrint plus.\nsimpl.\nrewrite <- plus_n_O.\nreflexivity.\nQed."
        ];
        const answers = [
            [false, "The variable plus_0_r was not found in the current environment."],
            [false, "The variable plus_0_r was not found in the current environment."],
            [false, "The variable plus_0_r was not found in the current environment."],
            [false, "The variable plus_0_r was not found in the current environment."],
            [false, 'Found no subterm matching "?n + 0" in the current goal.'],
            [false, "The variable plus_0_r was not found in the current environment."],
            [true, null]
        ];

        const res = await proofView.checkProofs(precedingContext, thrStatement, proofs);
        expect(res).toStrictEqual(answers);

        proofView.exit();
    });

    it("test parse file", async () => {
        const filePath = path.join(__dirname, 'resources', 'test_basics_only_sf.v');
        const parentDir = path.join(__dirname, 'resources');
        const proofView = await ProofView.init(filePath, parentDir);

        const theorems = await proofView.parseFile();
        expect(theorems.length).toBe(22);
        expect(theorems.filter(th => th.proof !== null).length).toBe(22);

        proofView.exit();
    }, 30000);

    it("Test retrive admit holes inside proof", async () => {
        const filePath = path.join(__dirname, 'resources', 'test_admit_holes.v');
        const parentDir = path.join(__dirname, 'resources');
        const proofView = await ProofView.init(filePath, parentDir);

        const holeThrAns = [
            "Lemma aux (A : Type) (P : A -> Prop) (x : A) (H : P x) :\n   P x.",
            "Lemma aux  :\n   0 = 0 \\/ 0 <> 0."
        ]
        let holeThrs: string[] = [];

        const theorems = await proofView.parseFile();
        for (const thr of theorems) {
            if (thr.proof !== null) {
                for (const hole of thr.proof.holes) {
                    holeThrs.push(hole.goalAsTheorem("aux"));
                }
            }
        }

        expect(holeThrs).toStrictEqual(holeThrAns);
    });
});