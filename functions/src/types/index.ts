import * as admin from 'firebase-admin';

// Re-exporting Firestore Timestamp for convenience
export type Timestamp = admin.firestore.Timestamp;

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

// Definicja typu dla wyniku scrapowania, przeniesiona tutaj, aby była globalna
export interface ScrapedData {
  companyName?: string;
  description?: string;
  sourceUrl: string;
  sourceType: 'company_website' | 'portal_oferteo' | 'registry_ceidg' | 'portal';
  contactDetails: {
    phones: string[];
    emails: string[];
    address: string;
  };
  pkdGlowny?: string;
  pkdCodes?: string[];
}

// Poprawna, oddzielna definicja typu TaskStatus
export type TaskStatus =
  | 'pending'
  | 'evaluating' // Nowy status oznaczający, że orkiestrator analizuje co dalej
  | 'enriching'
  | 'ceidg-searching'
  | 'searching'
  | 'classifying'
  | 'scraping-firmowe' // Nowy, specyficzny krok
  | 'scraping-portale' // Nowy, specyficzny krok
  | 'aggregating'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'terminated';

/**
 * Struktura dokumentu w kolekcji `tasks`.
 */
export interface Task {
  ownerId: string;
  createdAt: Timestamp;
  status: TaskStatus;
  completedSteps: string[]; // Nowe pole do śledzenia ukończonych kroków
  query: {
    initialQuery: string;
    identifiedService?: string;
    expandedKeywords?: string[];
    pkdCodes?: string[];
    selectedPkdSection?: string;
    location?: {
      city: string;
      province: string;
      radiusKm: number;
    };
  };
  logs: {
    timestamp: Timestamp;
    message: string;
    agent: string;
  }[];
  intermediateData?: {
    googleSearchResults?: SearchResult[];
    classifiedLinks?: ClassifiedLinks;
    selectableLinks?: ClassifiedLinks;
  };
  results?: {
    [key: string]: ScrapedData[];
  };
  workflowSteps?: string[];
}

export interface ClassifiedLinks {
  companyUrls: SearchResult[];
  portalUrls: SearchResult[];
}

/**
 * Struktura dokumentu w kolekcji `knowledge_base`.
 */
export interface Knowledge {
  domain: string;
  description: string;
  strategy: string;
  selectors: { 
    listingContainer?: string;
    itemCard?: string;
    profileLink?: string;
    companyNameOnProfile?: string;
    nextPageButton?: string;
  };
  lastUpdated: Timestamp | admin.firestore.FieldValue; // Poprawiony typ
  version: number;
}