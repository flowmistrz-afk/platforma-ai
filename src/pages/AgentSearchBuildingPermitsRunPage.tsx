// src/pages/AgentSearchBuildingPermitsRunPage.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

// --- Logika haka przeniesiona bezpośrednio do komponentu ---
interface SignedUrlResponse {
  upload_url: string;
  filename: string;
}

const useFileUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const uploadAndProcessFile = async (selectedFile: File) => {
    if (!selectedFile) {
      setStatusMessage('Najpierw wybierz plik.');
      setError('No file selected');
      return;
    }

    setUploading(true);
    setProcessing(false);
    setProgress(0);
    setStatusMessage('Inicjowanie przesyłania...');
    setError(null);

    try {
      setStatusMessage('Pobieranie bezpiecznego adresu URL do wysyłki...');
      const signedUrlResponse = await axios.post<SignedUrlResponse>(
        'https://file-processing-service-567539916654.europe-west1.run.app/get-upload-url/',
        { filename: selectedFile.name },
        { headers: { 'Content-Type': 'application/json' } }
      );
      const { upload_url, filename } = signedUrlResponse.data;

      setStatusMessage('Przesyłanie pliku...');
      await axios.put(upload_url, selectedFile, {
        headers: { 'Content-Type': 'text/csv' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setProgress(percentCompleted);
          }
        },
      });
      
      setUploading(false);
      setProcessing(true);
      setStatusMessage('Plik został pomyślnie przesłany! Rozpoczynam analizę...');

      const processResponse = await axios.post(
        'https://file-processing-service-567539916654.europe-west1.run.app/process-file/',
        { filename: filename },
        { headers: { 'Content-Type': 'application/json' } }
      );

      setProcessing(false);
      setStatusMessage(processResponse.data.message || 'Analiza zakończona pomyślnie!');
      setError(null);
      
    } catch (err) {
      console.error('Wystąpił błąd:', err);
      setUploading(false);
      setProcessing(false);
      setProgress(0);
      setStatusMessage('Wystąpił błąd. Sprawdź konsolę.');
      setError('Upload or processing failed.');
    }
  };

  return { uploading, processing, progress, statusMessage, error, uploadAndProcessFile };
};
// --- Koniec logiki haka ---

export default function AgentSearchBuildingPermitsRunPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { uploading, processing, progress, statusMessage, error, uploadAndProcessFile } = useFileUpload();

  const [gcsFiles, setGcsFiles] = useState<string[]>([]);
  const [selectedGcsFile, setSelectedGcsFile] = useState<string>('');
  const [isLoadingGcsFiles, setIsLoadingGcsFiles] = useState(false);
  const [gcsProcessing, setGcsProcessing] = useState(false);
  const [gcsStatusMessage, setGcsStatusMessage] = useState('');
  const [gcsError, setGcsError] = useState('');

  useEffect(() => {
    const fetchGcsFiles = async () => {
      setIsLoadingGcsFiles(true);
      try {
        const response = await axios.get('https://file-processing-service-567539916654.europe-west1.run.app/list-files/');
        setGcsFiles(response.data.files || []);
      } catch (err) {
        console.error("Nie udało się pobrać listy plików z GCS:", err);
        setGcsError('Nie udało się pobrać listy plików.');
      } finally {
        setIsLoadingGcsFiles(false);
      }
    };
    fetchGcsFiles();
  }, []);

  const handleLocalFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setSelectedGcsFile('');
      setGcsStatusMessage('');
      setGcsError('');
    }
  };
  
  const handleGcsFileSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedGcsFile(event.target.value);
    setSelectedFile(null);
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadAndProcessFile(selectedFile);
    }
  };

  const handleProcessGcsFile = async () => {
    if (!selectedGcsFile) return;
    setGcsProcessing(true);
    setGcsStatusMessage(`Rozpoczynam przetwarzanie pliku: ${selectedGcsFile}...`);
    setGcsError('');
    try {
        const response = await axios.post('https://file-processing-service-567539916654.europe-west1.run.app/process-file/', { filename: selectedGcsFile });
        setGcsStatusMessage(response.data.message || 'Przetwarzanie zakończone sukcesem!');
    } catch (err) {
        setGcsError('Wystąpił błąd podczas przetwarzania pliku. Sprawdź konsolę.');
        console.error(err);
    } finally {
      setGcsProcessing(false);
    }
  };

  return (
    <div>
      <h2>Wyszukiwanie pozwoleń na budowę</h2>

      <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h4>Opcja 1: Wgraj nowy plik z dysku</h4>
        <p>Wybierz plik CSV do analizy.</p>
        <input type="file" accept=".csv" onChange={handleLocalFileSelect} disabled={uploading || processing || gcsProcessing} />
        <button onClick={handleUpload} disabled={!selectedFile || uploading || processing || gcsProcessing}>
          {uploading ? `Przesyłanie... ${progress}%` : (processing ? 'Przetwarzanie...' : 'Prześlij i analizuj')}
        </button>
        {statusMessage && <p>{statusMessage}</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>

      <div style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h4>Opcja 2: Wybierz istniejący plik z chmury</h4>
        {isLoadingGcsFiles ? (
          <p>Ładowanie listy plików...</p>
        ) : (
          <>
            <select value={selectedGcsFile} onChange={handleGcsFileSelect} disabled={processing || uploading || gcsProcessing}>
              <option value="">-- Wybierz plik z Google Cloud Storage --</option>
              {gcsFiles.map(file => (
                <option key={file} value={file}>{file}</option>
              ))}
            </select>
            <button onClick={handleProcessGcsFile} disabled={!selectedGcsFile || processing || uploading || gcsProcessing}>
              {gcsProcessing ? 'Przetwarzanie...' : 'Przetwórz wybrany plik'}
            </button>
          </>
        )}
         {gcsStatusMessage && <p>{gcsStatusMessage}</p>}
         {gcsError && <p style={{ color: 'red' }}>{gcsError}</p>}
      </div>
    </div>
  );
}
