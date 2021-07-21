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
