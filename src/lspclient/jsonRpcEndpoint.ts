import { JSONRPCClient, JSONRPCRequest, JSONRPCResponse } from 'json-rpc-2.0';
import {EventEmitter, Readable, TransformOptions, Writable} from 'stream';
import { JSONRPCTransform } from './jsonRpcTransform';
import { Logger, LoggerLevel } from './logger';
import {JSONRPCParams} from "json-rpc-2.0/dist/models";

export class JSONRPCEndpoint extends EventEmitter {

    private writable: Writable;
    private readable: Readable;
    private readableByline: JSONRPCTransform;
    private client: JSONRPCClient;
    private nextId: number;
    private completedOperation: boolean;
    private shutdownFlag: boolean;
    public diagnostics: { [uri: string]: any[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
    public filesProgressLine: { [uri: string]: number };

    public isCompletedOperation(): boolean {
        return this.completedOperation;
    }

    public isShutdown(): boolean {
        return this.shutdownFlag;
    }

    public stop() {
        this.shutdownFlag = true;
    }

    encodeSpecialCharacters(inputString: string): string {
        return inputString.replace(/[\u007F-\uFFFF]/g, (char) => {
            const codePoint = char.codePointAt(0);
            if (codePoint !== undefined) {
                return `\\u${codePoint.toString(16).padStart(4, "0")}`;
            }
            return char;
        });
      }

    public constructor(writable: Writable, readable: Readable, options?: ConstructorParameters<typeof EventEmitter>[0] & TransformOptions) {
        super(options);
        this.nextId = 0;
        const createId = () => this.nextId++;
        this.writable = writable;
        this.readable = readable;
        this.completedOperation = false;
        this.shutdownFlag = false;
        this.diagnostics = {};
        this.filesProgressLine = {};

        this.readableByline = JSONRPCTransform.createStream(this.readable, options);

        this.client = new JSONRPCClient(async (jsonRPCRequest) => {
            let jsonRPCRequestStr = JSON.stringify(jsonRPCRequest);
            jsonRPCRequestStr = this.encodeSpecialCharacters(jsonRPCRequestStr); 
            Logger.log(`sending: ${jsonRPCRequestStr}`, LoggerLevel.DEBUG);
            this.writable.write(`Content-Length: ${jsonRPCRequestStr.length}\r\n\r\n${jsonRPCRequestStr}`);
        }, createId);

        this.readableByline.on('data', (jsonRPCResponseOrRequest: string) => {
            const jsonrpc = JSON.parse(jsonRPCResponseOrRequest);
            Logger.log(`[transform] ${jsonRPCResponseOrRequest}`, LoggerLevel.DEBUG);

            if (Object.prototype.hasOwnProperty.call(jsonrpc, 'id')) {
                const jsonRPCResponse: JSONRPCResponse = jsonrpc as JSONRPCResponse;
                if (jsonRPCResponse.id === (this.nextId - 1)) {
                    this.client.receive(jsonRPCResponse);
                } else {
                    Logger.log(`[transform] ${jsonRPCResponseOrRequest}`, LoggerLevel.ERROR);
                    this.emit('error', `[transform] Received id mismatch! Got ${jsonRPCResponse.id}, expected ${this.nextId - 1}`);
                }
            } else {
                if (jsonrpc.method === "$/coq/fileProgress") {
                    const processRange = jsonrpc.params.processing[0].range;
                    this.filesProgressLine[jsonrpc.params.textDocument.uri] = processRange.start.line;
                } else if (jsonrpc.method === "textDocument/publishDiagnostics") {
                    for (const diagnostic of jsonrpc.params.diagnostics) {
                        if (!(jsonrpc.params.uri in this.diagnostics)) {
                            this.diagnostics[jsonrpc.params.uri] = [];
                        }
                        this.diagnostics[jsonrpc.params.uri].push(diagnostic);
                    }
                    this.completedOperation = true;
                }
                const jsonRPCRequest: JSONRPCRequest = jsonrpc as JSONRPCRequest;
                this.emit(jsonRPCRequest.method, jsonRPCRequest.params);
            }
        });
    }

    public send(method: string, message?: JSONRPCParams): ReturnType<JSONRPCClient["request"]> {
        if (this.shutdownFlag) {
            return Promise.reject('Shutting down');
        }
        return this.client.request(method, message);
    }

    public notify(method: string, message?: JSONRPCParams): void {
        this.completedOperation = false;
        this.client.notify(method, message);
    }
}
