export interface TestAgentInput {
    name: string;
    message?: string;
    port?: number;
}
export declare function testAgent(input: TestAgentInput): Promise<string>;
