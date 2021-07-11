import { IngressController } from "./IngressController";

async function main()
{
    try
    {
        let server = new IngressController();
        await server.run();
    }
    catch (e)
    {
        console.log(e);
    }
}

main();