/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

export const SilentExec = (fnName = "function", withDefault = false, defaultValue: any = null): any => {
    return (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => { 
        // Save a reference to the original method
        const originalMethod = descriptor.value;

        // Rewrite original method with try/catch wrapper
        descriptor.value = function (...args: any[]) {
            try {
                const result = originalMethod.apply(this, args);

                // Check if method is asynchronous
                if (result && result instanceof Promise) {
                    // Return promise
                    return result.catch((_error: any) => {
                        if (withDefault) {
                            return defaultValue;
                        }
                        throw new Error(`Exception in ${fnName}`);
                    });
                }

                // Return actual result
                return result;
            } catch (error) {
                if (withDefault) {
                    return defaultValue;
                }
                throw new Error(`Exception in ${fnName}`);
            }
        };

    return descriptor;
    };
};