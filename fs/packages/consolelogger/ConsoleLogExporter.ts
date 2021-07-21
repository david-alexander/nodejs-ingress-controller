import { LogLevel } from "../core/Logger";
import { LogExporter } from "../core/LogExporter";

export class ConsoleLogExporter extends LogExporter
{
    public constructor()
    {
        super();
    }

    public async initialize()
    {
    }

    public log(component: string, level: LogLevel, message: string, data: any)
    {
        console.log(component, level, message, JSON.stringify(data));
    }
}
