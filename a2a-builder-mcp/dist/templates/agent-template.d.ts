export declare function agentPackageJson(name: string, description: string): string;
export declare function agentTsconfig(): string;
export interface AgentConfig {
    name: string;
    description: string;
    skills: {
        id: string;
        name: string;
        description: string;
    }[];
    model?: string;
    llmBaseUrl?: string;
    systemPrompt?: string;
}
export declare function agentCardJson(config: AgentConfig, url?: string): string;
export declare function serverTs(config: AgentConfig): string;
export declare function agentCardTs(config: AgentConfig): string;
export declare function agentCardTsClean(config: AgentConfig): string;
export declare function taskHandlerTs(config: AgentConfig): string;
export declare function vercelJson(): string;
export declare function vercelApiHandler(): string;
export declare function envExample(): string;
export declare function gitignore(): string;
