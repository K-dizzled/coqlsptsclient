import { SilentExec } from "../src/coqlspclient/silentExec";
import { describe, expect, it } from "vitest";

describe('silentExec', () => {
    it('should catch an exception and return the default value when withDefault is true', async () => {
        const defaultValue = 42;
        class MockClass {
            @SilentExec('exampleFunction', true, defaultValue)
            async mockFunction() {
                throw new Error('An exception occurred');
            }
        }
        const mockClass = new MockClass();
    
        const result = await mockClass.mockFunction();
        expect(result).toBe(defaultValue);
    });
    
    it('should throw an error when withDefault is false', async () => {
        class MockClass {
            @SilentExec('exampleFunction', false, null)
            async mockFunction() {
                throw new Error('An exception occurred');
            }
        }
        const mockClass = new MockClass();

        try {
            await mockClass.mockFunction();
        } catch (error) {
            expect(error.message).toBe('Exception in exampleFunction');
        }
    });

    it('should return the result of the function when no exception is thrown', async () => {
        class MockClass {
            @SilentExec('exampleFunction', false, null)
            async mockFunction() {
                return 42;
            }
        }

        const mockClass = new MockClass();

        const result = await mockClass.mockFunction();
        expect(result).toBe(42);
    });

    it('should return the result of the function when no exception is thrown and withDefault is true', async () => {
        class MockClass {
            @SilentExec('exampleFunction', true, null)
            async mockFunction() {
                return 42;
            }
        }

        const mockClass = new MockClass();

        const result = await mockClass.mockFunction();
        expect(result).toBe(42);
    });
});