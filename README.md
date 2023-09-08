# coqpylspclient
[Coq-lsp](https://github.com/ejgallego/coq-lsp) client implementation in typescript.

Package provides a partially implemented client for the coq-lsp server, as well as a wrapper around the client, that provides a useful interface for interacting with the server.

## How to use: 
```typescript
import { ProofView } from "coqlspclient";

// Create an instance of a coq-lsp client and initialize it.
const rootPath = path.join(__dirname, 'resources');     
const filePath = path.join(__dirname, 'resources', 'test1.v');
const proofView = await ProofView.init(
    filePath,
    rootPath
);

// Get a list of theorems in the file. 
const thrs = proofView.allTheoremNames();

// Get a theorem by name.
const thr = await proofView.getTheoremByName("test_thr2");

// It returns a `Theorem` object, which contains the theorem's
// statement as present in the file, as well as its proof, 
// augmented with the information about the proof steps. E.g. 
// the hyps and the conclusion of the focused goal at each step.

// Get proofs of all the theorems in the file.
const theorems = await proofView.parseFile();

// Does the same as: 
const theorems = await Promise.all(thrs.map(thr => proofView.getTheoremByName(thr)));
// but with better performance.

// Try to check the proof for a given theorem.
// preceding_context is a string containing the context preceding
// the proof. If you want to check the proof in top of the file,
// which ProofView was initialized with, then pass 
// preceding_context = '\n'.join(pv.lines)
const precedingContext = "";
const thrStatement = "Theorem plus_O_n'' : forall n:nat, 0 + n = n.";
const proof = "Proof. Admitted.";

const res = await proofView.checkProof(thrStatement, proof, precedingContext);

// Close the connection to the server.
proofView.close();
```

## Install requirements

```
npm install
```

## Run the tests

```
npm run test
```