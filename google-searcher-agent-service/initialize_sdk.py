import vertexai
from vertexai import agent_engines # For the prebuilt templates

client = vertexai.Client(  # For service interactions via client.agent_engines
    project="automatyzacja-pesamu",
    location="europe-west1",
)

print("Vertex AI SDK client initialized successfully!")
print(f"Project: {client._api_client.project}")
print(f"Location: {client._api_client.location}")