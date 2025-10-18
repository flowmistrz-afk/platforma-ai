import { Timestamp } from 'firebase/firestore';

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  TERMINATED = 'terminated',
  WAITING_FOR_USER_SELECTION = 'waiting-for-user-selection',
}

// Uproszczona definicja dla frontendu

export interface ScrapedData {
  companyName?: string;
  description?: string;
  sourceUrl: string;
  sourceType: string;
  contactDetails: {
    phones: string[];
    emails: string[];
    address: string;
  };
  pkdGlowny?: string;
  pkdCodes?: string[];
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export interface ClassifiedLinks {
  companyUrls: SearchResult[];
  portalUrls: SearchResult[];
}

export interface Task {
  status: TaskStatus;
  previousStatus?: TaskStatus;
  logs: {
    timestamp: Timestamp;
    agent: string;
    message: string;
  }[];
  results?: {
    [key: string]: ScrapedData[];
  };
  intermediateData?: {
    googleSearchResults?: {
      link: string;
      title: string;
      snippet: string;
    }[];
    classifiedLinks?: ClassifiedLinks;
    selectableLinks?: ClassifiedLinks;
  };
}
