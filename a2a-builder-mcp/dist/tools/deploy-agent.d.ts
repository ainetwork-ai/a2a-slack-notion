export interface DeployAgentInput {
    name: string;
    prod?: boolean;
}
export declare function deployAgent(input: DeployAgentInput): Promise<string>;
