import { LogExporter } from "./LogExporter";

export enum LogLevel { 
    FATAL = 'fatal',
    ERROR = 'error',
    WARN = 'warn',
    INFO = 'info',
    DEBUG = 'debug',
    TRACE = 'trace'
};

export class Logger
{
    public constructor(private exporter: LogExporter)
    {

    }

    public async initialize()
    {
        await this.exporter.initialize();
    }

    public log(component: string, level: LogLevel, message: string, data: any)
    {
        this.exporter.log(component, level, message, data);
    }
}
