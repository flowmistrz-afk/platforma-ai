import * as admin from "firebase-admin";
import { VertexAI } from "@google-cloud/vertexai";

admin.initializeApp({ projectId: "automatyzacja-pesamu" });

export const db = admin.firestore();
export const vertex_ai = new VertexAI({ project: "automatyzacja-pesamu", location: "europe-west4" });
