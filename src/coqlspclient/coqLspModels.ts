import * as lspModels from '../lspclient/models';

export enum PpFormat {
    Pp = 'Pp',
    Str = 'Str'
}

export class GoalRequest {
    constructor(
        public textDocument: lspModels.TextDocumentIdentifier, // TODO: Maybe need versioned
        public position: lspModels.Position,
        public pp_format: PpFormat
    ) {}
}

export class Hyp {
    constructor(
        public names: string[],
        public ty: string,
        public definition: string | null = null
    ) {}

    public static fromHypDict(hyp: { [key: string]: unknown }): Hyp {
        if (
            !Array.isArray(hyp['names']) || 
            typeof(hyp['names'][0]) !== 'string' || 
            typeof(hyp['ty']) !== 'string' 
        ) {
            throw new Error('Invalid Hyp dictionary')
        }
        return new Hyp(
            hyp['names'],
            hyp['ty'],
            typeof(hyp['def']) === 'string' ? hyp['def'] : null
        )
    }

    public toString(): string {
        return `${this.names.join(', ')} : ${this.ty}`
    }
}

export class Goal {
    constructor(
        public hyps: Hyp[],
        public ty: string
    ) {}

    public static fromGoalDict(goal: { [key: string]: unknown }): Goal {
        if (
            !Array.isArray(goal['hyps']) || 
            typeof(goal['ty']) !== 'string' 
        ) {
            throw new Error('Invalid Goal dictionary')
        }
        return new Goal(
            goal['hyps'].map(hyp => Hyp.fromHypDict(hyp)),
            goal['ty']
        )
    }
}

export class GoalConfig {
    constructor(
        public goals: Goal[],
        public stack: [Goal[], Goal[]][],
        public shelf: Goal[],
        public given_up: Goal[],
        public bullet: string | null = null
    ) {}

    public static fromGoalConfigDict(goalConfig: { [key: string]: unknown }): GoalConfig {
        if (
            !Array.isArray(goalConfig['goals']) || 
            !Array.isArray(goalConfig['stack']) || 
            !Array.isArray(goalConfig['shelf']) || 
            !Array.isArray(goalConfig['given_up']) 
        ) {
            throw new Error('Invalid GoalConfig dictionary')
        }
        return new GoalConfig(
            goalConfig['goals'].map(goal => Goal.fromGoalDict(goal)),
            goalConfig['stack'].map(goalsTuple => [
                goalsTuple[0].map((goal: { [key: string]: unknown }) => Goal.fromGoalDict(goal)),
                goalsTuple[1].map((goal: { [key: string]: unknown }) => Goal.fromGoalDict(goal))
            ]),
            goalConfig['shelf'].map(goal => Goal.fromGoalDict(goal)),
            goalConfig['given_up'].map(goal => Goal.fromGoalDict(goal)),
            typeof(goalConfig['bullet']) === 'string' ? goalConfig['bullet'] : null
        )
    }
}

export class Message {
    constructor(
        public text: string,
        public level: number | null = null,
        public range: lspModels.Range | null = null
    ) {}
}

export class GoalAnswer {
    constructor(
        public textDocument: lspModels.TextDocumentIdentifier,
        public position: lspModels.Position,
        public messages: Message[],
        public goals: GoalConfig | null = null,
        public error: string | null = null,
        public program: any | null = null // eslint-disable-line @typescript-eslint/no-explicit-any
    ) {}
}

export interface FlecheDocumentParams {
    textDocument: lspModels.TextDocumentIdentifier;
}

export interface GoalsReqeustParams {
    textDocument: lspModels.OptionalVersionedTextDocumentIdentifier;
    position: lspModels.Position;
}

export enum Status {
    Yes = 'Yes',
    Stopped = 'Stopped',
    Failed = 'Failed'
}

export interface CompletionStatus {
    status : Status;
    range : lspModels.Range
};

type SpanInfo = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface RangedSpan {
    range : lspModels.Range;
    span?: SpanInfo
};

export interface FlecheDocument {
    spans: RangedSpan[];
    completed : CompletionStatus
};

export enum LspPesponseErrorCodes {
    FlescheDocumentParsingError = 1,
    AstParsingError = 2
}

export class LspResponseParsingError extends Error {
    constructor(
        public code: LspPesponseErrorCodes,
        public message: string,
        public data: any | null = null // eslint-disable-line @typescript-eslint/no-explicit-any
    ) {
        super(message);
    }
}

export function positionFromLsp(position: { [key: string]: unknown }): lspModels.Position {
    if (
        typeof(position['line']) !== 'number' || 
        typeof(position['character']) !== 'number' 
    ) {
        throw new Error('Invalid Position dictionary')
    }
    return {
        line: position['line'],
        character: position['character']
    }
}

export function rangeFromLsp(range: { [key: string]: unknown }): lspModels.Range {
    return {
        start: positionFromLsp(range['start'] as { [key: string]: unknown }),
        end: positionFromLsp(range['end'] as { [key: string]: unknown })
    }
}

export function flecheDocFromLsp(ast: { [key: string]: any }): FlecheDocument {
    
    if (
        !Array.isArray(ast['completed']['status']) || 
        ast['completed']['status'].length !== 1 || 
        typeof(ast['completed']['status'][0]) !== 'string' 
    ) {
        throw new LspResponseParsingError(
            LspPesponseErrorCodes.FlescheDocumentParsingError,
            'Expected exactly one completion status'
        )
    }
    const status = ast['completed']['status'][0]

    if (!Array.isArray(ast['spans'])) {
        throw new LspResponseParsingError(
            LspPesponseErrorCodes.FlescheDocumentParsingError,
            'Expected spans to be an array'
        )
    }

    const completionStatus: CompletionStatus = {
        status: status as Status,
        range: rangeFromLsp(ast['completed']['range'])
    }

    const spans = ast['spans'].map((span: { [key: string]: { [key: string]: unknown } }) => {
        return {
            range: rangeFromLsp(span['range']),
            span: span['span'] || null
        }
    });

    return {
        spans: spans,
        completed: completionStatus
    }
}

export enum Vernacexpr {
    VernacLoad = 'VernacLoad',
    VernacSyntaxExtension = 'VernacSyntaxExtension',
    VernacOpenCloseScope = 'VernacOpenCloseScope',
    VernacDelimiters = 'VernacDelimiters',
    VernacBindScope = 'VernacBindScope',
    VernacInfix = 'VernacInfix',
    VernacNotation = 'VernacNotation',
    VernacNotationAddFormat = 'VernacNotationAddFormat',
    VernacDefinition = 'VernacDefinition',
    VernacStartTheoremProof = 'VernacStartTheoremProof',
    VernacEndProof = 'VernacEndProof',
    VernacExactProof = 'VernacExactProof',
    VernacAssumption = 'VernacAssumption',
    VernacInductive = 'VernacInductive',
    VernacFixpoint = 'VernacFixpoint',
    VernacCoFixpoint = 'VernacCoFixpoint',
    VernacScheme = 'VernacScheme',
    VernacCombinedScheme = 'VernacCombinedScheme',
    VernacUniverse = 'VernacUniverse',
    VernacConstraint = 'VernacConstraint',
    VernacBeginSection = 'VernacBeginSection',
    VernacEndSegment = 'VernacEndSegment',
    VernacRequire = 'VernacRequire',
    VernacImport = 'VernacImport',
    VernacCanonical = 'VernacCanonical',
    VernacCoercion = 'VernacCoercion',
    VernacIdentityCoercion = 'VernacIdentityCoercion',
    VernacNameSectionHypSet = 'VernacNameSectionHypSet',
    VernacInstance = 'VernacInstance',
    VernacContext = 'VernacContext',
    VernacDeclareInstances = 'VernacDeclareInstances',
    VernacDeclareClass = 'VernacDeclareClass',
    VernacDeclareModule = 'VernacDeclareModule',
    VernacDefineModule = 'VernacDefineModule',
    VernacDeclareModuleType = 'VernacDeclareModuleType',
    VernacInclude = 'VernacInclude',
    VernacSolveExistential = 'VernacSolveExistential',
    VernacAddLoadPath = 'VernacAddLoadPath',
    VernacRemoveLoadPath = 'VernacRemoveLoadPath',
    VernacAddMLPath = 'VernacAddMLPath',
    VernacDeclareMLModule = 'VernacDeclareMLModule',
    VernacChdir = 'VernacChdir',
    VernacWriteState = 'VernacWriteState',
    VernacRestoreState = 'VernacRestoreState',
    VernacResetName = 'VernacResetName',
    VernacResetInitial = 'VernacResetInitial',
    VernacBack = 'VernacBack',
    VernacBackTo = 'VernacBackTo',
    VernacCreateHintDb = 'VernacCreateHintDb',
    VernacRemoveHints = 'VernacRemoveHints',
    VernacHints = 'VernacHints',
    VernacSyntacticDefinition = 'VernacSyntacticDefinition',
    VernacDeclareImplicits = 'VernacDeclareImplicits',
    VernacArguments = 'VernacArguments',
    VernacArgumentsScope = 'VernacArgumentsScope',
    VernacReserve = 'VernacReserve',
    VernacGeneralizable = 'VernacGeneralizable',
    VernacSetOpacity = 'VernacSetOpacity',
    VernacSetStrategy = 'VernacSetStrategy',
    VernacUnsetOption = 'VernacUnsetOption',
    VernacSetOption = 'VernacSetOption',
    VernacAddOption = 'VernacAddOption',
    VernacRemoveOption = 'VernacRemoveOption',
    VernacMemOption = 'VernacMemOption',
    VernacPrintOption = 'VernacPrintOption',
    VernacCheckMayEval = 'VernacCheckMayEval',
    VernacGlobalCheck = 'VernacGlobalCheck',
    VernacDeclareReduction = 'VernacDeclareReduction',
    VernacPrint = 'VernacPrint',
    VernacSearch = 'VernacSearch',
    VernacLocate = 'VernacLocate',
    VernacRegister = 'VernacRegister',
    VernacComments = 'VernacComments',
    VernacAbort = 'VernacAbort',
    VernacAbortAll = 'VernacAbortAll',
    VernacRestart = 'VernacRestart',
    VernacUndo = 'VernacUndo',
    VernacUndoTo = 'VernacUndoTo',
    VernacBacktrack = 'VernacBacktrack',
    VernacFocus = 'VernacFocus',
    VernacUnfocus = 'VernacUnfocus',
    VernacUnfocused = 'VernacUnfocused',
    VernacBullet = 'VernacBullet',
    VernacSubproof = 'VernacSubproof',
    VernacEndSubproof = 'VernacEndSubproof',
    VernacShow = 'VernacShow',
    VernacCheckGuard = 'VernacCheckGuard',
    VernacProof = 'VernacProof',
    VernacProofMode = 'VernacProofMode',
    VernacToplevelControl = 'VernacToplevelControl',
    VernacExtend = 'VernacExtend'
}

export class ProofViewError extends Error {
    constructor(
        public message: string,
        public data: any | null = null // eslint-disable-line @typescript-eslint/no-explicit-any
    ) {
        super(message);
    }
}    

export class ProofStep {
    constructor(
        public text: string,
        public focused_goal: Goal | null,
        public vernac_type: Vernacexpr
    ) {}

    public toString(): string {
        let text = this.text
        if (this.vernac_type === Vernacexpr.VernacBullet || this.vernac_type === Vernacexpr.VernacEndProof) {
            return text
        }

        if (this.focused_goal !== null) {
            const hyps = this.focused_goal.hyps
            if (hyps.length > 0) {
                text += '\n(*\n[CONTEXT]\n'
                text += (hyps.map(hyp => hyp.toString())).join('\n') + '\n*)'
            } else {
                text += '\n(* [CONTEXT] {EMPTY CONTEXT} *)'
            }
            text += '\n(* [GOAL] ' + this.focused_goal.ty + ' *)\n'
        } else {
            text += '\n(* [CONTEXT] {NO CONTEXT} *)'
            text += '\n(* [GOAL] {NO GOALS} *)\n'
        }

        return text
    }
}

export class TheoremProof {
    constructor(
        public proof_steps: ProofStep[],
        public end_pos: lspModels.Range,
        public is_incomplete: boolean
    ) {}

    public toString(): string {
        let text = ''
        for (const step of this.proof_steps) {
            text += step.toString() + (step.vernac_type !== Vernacexpr.VernacBullet ? '\n' : ' ')
        }
        return text
    }

    public onlyText(): string {
        let text = ''
        for (const step of this.proof_steps) {
            text += step.text + (step.vernac_type !== Vernacexpr.VernacBullet ? '\n' : ' ')
        }
        return text
    }
}

export class Theorem {
    constructor(
        public name: string,
        public statement_range: lspModels.Range,
        public statement: string,
        public proof: TheoremProof | null = null
    ) {}

    public toString(): string {
        let text = this.statement
        if (this.proof !== null) {
            text += '\n' + this.proof.toString()
        }
        return text
    }

    public onlyText(): string {
        let text = this.statement
        if (this.proof !== null) {
            text += '\n' + this.proof.onlyText()
        }
        return text
    }
}