export function agentCard(baseUrl: string) {
  return {
    name: "hello-world",
    description: "A simple test agent that greets users",
    url: baseUrl,
    version: "0.1.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    authentication: null,
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    skills: [
    {
        "id": "greet",
        "name": "Greeting",
        "description": "Greets the user in a friendly way",
        "tags": [],
        "examples": []
    }
],
  };
}
