/**
 * Error-handling wrapper for functions that call Kubernetes APIs.
 * @param func A function to execute.
 * @returns The result of executing the function.
 */
export async function k8sApiCall<T>(func: () => Promise<T>)
{
    try
    {
        return await func();
    }
    catch (e)
    {
        throw new Error(`Kubernetes API error: ${e.response.body.message}`);
    }
}
