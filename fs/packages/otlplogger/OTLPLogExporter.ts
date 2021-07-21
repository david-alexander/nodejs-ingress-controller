import { LogLevel } from "../core/Logger";
import { LogExporter } from "../core/LogExporter";

import {  } from "@opentelemetry/core";
import { NodeTracerProvider } from "@opentelemetry/node";
import { SimpleSpanProcessor, ConsoleSpanExporter } from "@opentelemetry/tracing";
import { B3Propagator } from "@opentelemetry/propagator-b3";
import { CollectorTraceExporter } from '@opentelemetry/exporter-collector';

export class OTLPLogExporter extends LogExporter
{
    public constructor()
    {
        super();
    }

    public async initialize()
    {
        const provider = new NodeTracerProvider({
        });
    
        provider.addSpanProcessor(new SimpleSpanProcessor(new CollectorTraceExporter({})));
        provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    
        provider.register({
            propagator: new B3Propagator()
        });
    }

    public log(component: string, level: LogLevel, message: string, data: any)
    {
        // TODO
    }
}
