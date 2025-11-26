from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from enum import Enum

# --- Definicje zgodne z Twoim systemem State ---

class LeadStatus(str, Enum):
    RAW = "RAW"             # Surowy, prosto z Google
    FILTERED_OK = "OK"      # Po filtracji nazwy
    REJECTED = "REJECTED"   # Odrzucony (np. fryzjer)
    MANUAL = "MANUAL"       # Wymaga ręcznego sprawdzenia

class HarvestRequest(BaseModel):
    cities: List[str]
    keywords: List[str]
    pkd_codes: Optional[List[str]] = None

class LeadResult(BaseModel):
    name: str = Field(..., description="Nazwa firmy z nagłówka/tytułu")
    url: Optional[str] = None
    city: str
    source: str  # "Google Internal", "CEIDG", "Aleo"
    
    # Pola dla State Managera (domyślnie ustawiane przez Żniwiarza)
    status: LeadStatus = LeadStatus.RAW 
    confidence_score: int = 50 
    metadata: Dict[str, str] = {} # Tu wrzucamy opis, snippet z Google itp.

class HarvestResponse(BaseModel):
    total: int
    leads: List[LeadResult]
# NOWE KLASY:
class SmartRequest(BaseModel):
    prompt: str = Field(..., description="Opis zlecenia np. '2000m2 posadzki w Dębicy'")

class StrategyInfo(BaseModel):
    reasoning: str
    target_cities: List[str]
    keywords: List[str]
    pkd_codes: List[str]

class SmartResponse(BaseModel):
    strategy: StrategyInfo
    harvest_result: HarvestResponse

# NOWE KLASY DLA DETEKTYWA:
class EnrichRequest(BaseModel):
    urls: List[str]

class EnrichResult(BaseModel):
    url: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None
    # To jest kluczowa zmiana:
    projects: Optional[List[str]] = Field(default_factory=list) 
    status: str