import { LogLevel } from "./Logger";

export abstract class LogExporter
{
    public abstract initialize(): Promise<void>;
    public abstract log(component: string, level: LogLevel, message: string, data: any): void;
}
