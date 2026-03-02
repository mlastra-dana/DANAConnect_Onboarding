import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { useOnboarding } from '../app/OnboardingContext';
import { DocumentUploader } from '../components/onboarding/DocumentUploader';
import { Button } from '../components/ui/Button';
import { Toast } from '../components/ui/Toast';
import { validateDocumentFile } from '../lib/validators/documentValidators';
import { createEmptyDocument, createEmptyRepresentative } from '../app/state';
import { DocumentRecord, RequiredDocumentType, RepresentativeRecord } from '../app/types';

type UploadKey = 'rif' | 'registroMercantil' | 'rep1' | 'rep2';

const initialBoolMap: Record<UploadKey, boolean> = {
  rif: false,
  registroMercantil: false,
  rep1: false,
  rep2: false
};

const initialNumMap: Record<UploadKey, number> = {
  rif: 0,
  registroMercantil: 0,
  rep1: 0,
  rep2: 0
};

export function DocumentsPage({ companyId }: { companyId: string }) {
  const { state, setDocument, setRepresentative, setRepresentativeEnabled, allDocumentsValid } = useOnboarding();
  const [loadingMap, setLoadingMap] = useState<Record<UploadKey, boolean>>(initialBoolMap);
  const [uploadingMap, setUploadingMap] = useState<Record<UploadKey, boolean>>(initialBoolMap);
  const [uploadProgressMap, setUploadProgressMap] = useState<Record<UploadKey, number>>(initialNumMap);
  const [validationProgressMap, setValidationProgressMap] = useState<Record<UploadKey, number>>(initialNumMap);
  const [runtimeFiles, setRuntimeFiles] = useState<Partial<Record<UploadKey, File>>>({});

  const representative1 = state.representatives.find((rep) => rep.id === 1)!;
  const representative2 = state.representatives.find((rep) => rep.id === 2)!;

  async function handleUploadBase(docType: RequiredDocumentType, file: File) {
    const key: UploadKey = docType;
    setUploadingMap((prev) => ({ ...prev, [key]: true }));
    setUploadProgressMap((prev) => ({ ...prev, [key]: 0 }));
    setValidationProgressMap((prev) => ({ ...prev, [key]: 0 }));

    await simulateUpload((progress) => {
      setUploadProgressMap((prev) => ({ ...prev, [key]: progress }));
    });

    setUploadingMap((prev) => ({ ...prev, [key]: false }));
    setLoadingMap((prev) => ({ ...prev, [key]: true }));

    const previousPreview = state.documents[docType].previewUrl;
    if (previousPreview) URL.revokeObjectURL(previousPreview);

    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    setRuntimeFiles((prev) => ({ ...prev, [key]: file }));

    const result = await validateDocumentFile(docType, file, (progress) => {
      setValidationProgressMap((prev) => ({ ...prev, [key]: progress }));
    });

    setDocument(docType, {
      type: docType,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      previewUrl,
      validation: result
    });

    setLoadingMap((prev) => ({ ...prev, [key]: false }));
  }

  async function handleUploadRepresentative(repId: 1 | 2, file: File) {
    const key: UploadKey = repId === 1 ? 'rep1' : 'rep2';
    const currentRep = state.representatives.find((rep) => rep.id === repId)!;

    setUploadingMap((prev) => ({ ...prev, [key]: true }));
    setUploadProgressMap((prev) => ({ ...prev, [key]: 0 }));
    setValidationProgressMap((prev) => ({ ...prev, [key]: 0 }));

    await simulateUpload((progress) => {
      setUploadProgressMap((prev) => ({ ...prev, [key]: progress }));
    });

    setUploadingMap((prev) => ({ ...prev, [key]: false }));
    setLoadingMap((prev) => ({ ...prev, [key]: true }));

    if (currentRep.document.previewUrl) {
      URL.revokeObjectURL(currentRep.document.previewUrl);
    }

    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    setRuntimeFiles((prev) => ({ ...prev, [key]: file }));

    const result = await validateDocumentFile('cedulaRepresentante', file, (progress) => {
      setValidationProgressMap((prev) => ({ ...prev, [key]: progress }));
    });

    const nextRep: RepresentativeRecord = {
      ...currentRep,
      enabled: true,
      document: {
        type: 'cedulaRepresentante',
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        previewUrl,
        validation: result
      }
    };

    setRepresentative(repId, nextRep);
    setLoadingMap((prev) => ({ ...prev, [key]: false }));
  }

  function handleRemoveBase(docType: RequiredDocumentType) {
    const key: UploadKey = docType;
    const previous = state.documents[docType];
    if (previous.previewUrl) URL.revokeObjectURL(previous.previewUrl);

    setDocument(docType, createEmptyDocument(docType));
    clearUploaderRuntime(key);
  }

  function handleRemoveRepresentative(repId: 1 | 2) {
    const key: UploadKey = repId === 1 ? 'rep1' : 'rep2';
    const currentRep = state.representatives.find((rep) => rep.id === repId)!;
    if (currentRep.document.previewUrl) URL.revokeObjectURL(currentRep.document.previewUrl);

    setRepresentative(repId, {
      ...currentRep,
      document: createEmptyDocument('cedulaRepresentante')
    });

    clearUploaderRuntime(key);
  }

  function handleAddRepresentative2() {
    setRepresentativeEnabled(2, true);
  }

  function handleDeleteRepresentative2() {
    handleRemoveRepresentative(2);
    setRepresentative(2, createEmptyRepresentative(2, false));
    setRepresentativeEnabled(2, false);
  }

  function clearUploaderRuntime(key: UploadKey) {
    setRuntimeFiles((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setLoadingMap((prev) => ({ ...prev, [key]: false }));
    setUploadingMap((prev) => ({ ...prev, [key]: false }));
    setUploadProgressMap((prev) => ({ ...prev, [key]: 0 }));
    setValidationProgressMap((prev) => ({ ...prev, [key]: 0 }));
  }

  return (
    <div className="space-y-6">
      <Toast type="info" message="Sus documentos se procesan en su navegador (demo)." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(state.documents) as RequiredDocumentType[]).map((docType) => (
          <DocumentUploader
            key={docType}
            docRecord={state.documents[docType] as DocumentRecord}
            loading={loadingMap[docType] || uploadingMap[docType]}
            isUploading={uploadingMap[docType]}
            uploadProgress={uploadProgressMap[docType]}
            validationProgress={validationProgressMap[docType]}
            previewFile={runtimeFiles[docType]}
            onSelectFile={(file) => handleUploadBase(docType, file)}
            onRemoveFile={() => handleRemoveBase(docType)}
          />
        ))}

        <DocumentUploader
          title="Cédula del Representante 1 (Obligatorio)"
          sectionTitle="Representantes legales"
          sectionDescription="Cargue la cédula del representante principal. Puede agregar un segundo representante si aplica."
          sectionAction={
            !representative2.enabled ? (
              <Button type="button" variant="secondary" onClick={handleAddRepresentative2}>
                <Plus className="h-4 w-4" />
                Agregar segundo representante
              </Button>
            ) : null
          }
          docRecord={{ ...representative1.document, type: 'cedulaRepresentante' }}
          loading={loadingMap.rep1 || uploadingMap.rep1}
          isUploading={uploadingMap.rep1}
          uploadProgress={uploadProgressMap.rep1}
          validationProgress={validationProgressMap.rep1}
          previewFile={runtimeFiles.rep1}
          onSelectFile={(file) => handleUploadRepresentative(1, file)}
          onRemoveFile={() => handleRemoveRepresentative(1)}
        />

      </div>

      {representative2.enabled ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="hidden md:block" aria-hidden="true" />
          <div className="hidden lg:block" aria-hidden="true" />
          <DocumentUploader
            title="Cédula del Segundo representante (Opcional)"
            sectionTitle="Segundo representante"
            sectionAction={
              <Button type="button" variant="ghost" onClick={handleDeleteRepresentative2}>
                <Trash2 className="h-4 w-4" />
                Quitar segundo representante
              </Button>
            }
            docRecord={{ ...representative2.document, type: 'cedulaRepresentante' }}
            loading={loadingMap.rep2 || uploadingMap.rep2}
            isUploading={uploadingMap.rep2}
            uploadProgress={uploadProgressMap.rep2}
            validationProgress={validationProgressMap.rep2}
            previewFile={runtimeFiles.rep2}
            onSelectFile={(file) => handleUploadRepresentative(2, file)}
            onRemoveFile={() => handleRemoveRepresentative(2)}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap justify-between gap-3">
        <Link to={`/onboarding/${companyId}`}>
          <Button variant="ghost">Volver</Button>
        </Link>
        <Link to={`/onboarding/${companyId}/excel`}>
          <Button disabled={!allDocumentsValid}>Continuar al Excel</Button>
        </Link>
      </div>
    </div>
  );
}

async function simulateUpload(onProgress: (progress: number) => void) {
  return new Promise<void>((resolve) => {
    let value = 0;
    onProgress(0);
    const timer = setInterval(() => {
      value += 14;
      if (value >= 100) {
        onProgress(100);
        clearInterval(timer);
        resolve();
        return;
      }
      onProgress(value);
    }, 35);
  });
}
