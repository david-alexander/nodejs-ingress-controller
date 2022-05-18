import { LogLevel } from "./Logger";

/**
 * Generic logger backend interface.
 */
export abstract class LogExporter
{
    public abstract initialize(): Promise<void>;

    /**
     * Output a log message.
     * @param component The name of the component generating the log message.
     * @param level The log level of the message.
     * @param message The message itself.
     * @param data Arbitrary key/value data to include with the log message.
     */
    public abstract log(component: string, level: LogLevel, message: string, data: any): void;
}
