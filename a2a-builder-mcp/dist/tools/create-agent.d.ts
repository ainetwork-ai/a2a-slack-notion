export interface CreateAgentInput {
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
export declare function createAgent(input: CreateAgentInput): Promise<string>;
