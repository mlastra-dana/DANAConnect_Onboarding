import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { useOnboarding } from '../app/OnboardingContext';
import { FileUploadCard } from '../components/onboarding/FileUploadCard';
import { Button } from '../components/ui/Button';
import { Toast } from '../components/ui/Toast';
import { validateDocumentFile } from '../lib/validators/documentValidators';
import { createEmptyDocument, createEmptyRepresentative } from '../app/state';
import { DocumentRecord, DocumentType, RepresentativeRecord } from '../app/types';
import { getDocumentLabel, getDocumentOrder, getFlowConfig, requiresRepresentatives } from '../config/onboardingCountries';
import { Card } from '../components/ui/Card';

type UploadKey = DocumentType | 'rep1' | 'rep2';

const initialBoolMap: Record<UploadKey, boolean> = {
  rif: false,
  registroMercantil: false,
  documentoIdentidad: false,
  cedulaRepresentante: false,
  rep1: false,
  rep2: false
};

const initialNumMap: Record<UploadKey, number> = {
  rif: 0,
  registroMercantil: 0,
  documentoIdentidad: 0,
  cedulaRepresentante: 0,
  rep1: 0,
  rep2: 0
};

export function DocumentsPage({ companyId }: { companyId: string }) {
  const { state, setDocument, setRepresentative, setRepresentativeEnabled, setPersonalInfo, allDocumentsValid } = useOnboarding();
  const [loadingMap, setLoadingMap] = useState<Record<UploadKey, boolean>>(initialBoolMap);
  const [uploadingMap, setUploadingMap] = useState<Record<UploadKey, boolean>>(initialBoolMap);
  const [uploadProgressMap, setUploadProgressMap] = useState<Record<UploadKey, number>>(initialNumMap);
  const [validationProgressMap, setValidationProgressMap] = useState<Record<UploadKey, number>>(initialNumMap);
  const [runtimeFiles, setRuntimeFiles] = useState<Partial<Record<UploadKey, File>>>({});

  const representative1 = state.representatives.find((rep) => rep.id === 1)!;
  const representative2 = state.representatives.find((rep) => rep.id === 2)!;
  const flowConfig = getFlowConfig(state.country, state.personType);
  const documentOrder = getDocumentOrder(state.country, state.personType);
  const showRepresentatives = requiresRepresentatives(state.country, state.personType);

  async function handleUploadBase(docType: DocumentType, file: File) {
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

    const result = await validateDocumentFile(docType, file, state.country, (progress) => {
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

    if (state.personType === 'natural' && docType === 'documentoIdentidad' && result.extractedIdentity) {
      setPersonalInfo({
        firstName: result.extractedIdentity.firstName ?? '',
        lastName: result.extractedIdentity.lastName ?? '',
        documentNumber: result.extractedIdentity.documentNumber ?? ''
      });
    }

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

    const result = await validateDocumentFile('cedulaRepresentante', file, state.country, (progress) => {
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

  function handleRemoveBase(docType: DocumentType) {
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
      <Toast type="info" message={flowConfig.documentsIntro} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {documentOrder.map((docType) => (
          <FileUploadCard
            key={docType}
            docRecord={state.documents[docType] as DocumentRecord}
            title={getDocumentLabel(state.country, state.personType, docType)}
            label={getDocumentLabel(state.country, state.personType, docType)}
            loading={loadingMap[docType] || uploadingMap[docType]}
            isUploading={uploadingMap[docType]}
            uploadProgress={uploadProgressMap[docType]}
            validationProgress={validationProgressMap[docType]}
            previewFile={runtimeFiles[docType]}
            onSelectFile={(file) => handleUploadBase(docType, file)}
            onRemoveFile={() => handleRemoveBase(docType)}
          />
        ))}

        {showRepresentatives ? (
          <FileUploadCard
            sectionTitle={flowConfig.representativeSectionTitle}
            sectionDescription={flowConfig.representativeSectionDescription}
            sectionAction={
              !representative2.enabled ? (
                <Button type="button" variant="secondary" onClick={handleAddRepresentative2}>
                  <Plus className="h-4 w-4" />
                  {flowConfig.addSecondRepresentativeLabel}
                </Button>
              ) : undefined
            }
            title={flowConfig.representativePrimaryTitle}
            label={getDocumentLabel(state.country, state.personType, 'cedulaRepresentante')}
            docRecord={{ ...representative1.document, type: 'cedulaRepresentante' }}
            loading={loadingMap.rep1 || uploadingMap.rep1}
            isUploading={uploadingMap.rep1}
            uploadProgress={uploadProgressMap.rep1}
            validationProgress={validationProgressMap.rep1}
            previewFile={runtimeFiles.rep1}
            onSelectFile={(file) => handleUploadRepresentative(1, file)}
            onRemoveFile={() => handleRemoveRepresentative(1)}
          />
        ) : null}

        {showRepresentatives && representative2.enabled ? (
          <FileUploadCard
            title={flowConfig.representativeSecondaryTitle}
            label={getDocumentLabel(state.country, state.personType, 'cedulaRepresentante')}
            sectionAction={
              <Button type="button" variant="ghost" onClick={handleDeleteRepresentative2}>
                <Trash2 className="h-4 w-4" />
                {flowConfig.removeSecondRepresentativeLabel}
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
        ) : null}
      </div>

      {state.personType === 'natural' ? (
        <Card>
          <h3 className="text-lg font-semibold text-dark">Datos de identidad</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium text-dark">Nombres</span>
              <input
                type="text"
                value={state.personalInfo.firstName}
                onChange={(event) =>
                  setPersonalInfo({
                    ...state.personalInfo,
                    firstName: event.target.value
                  })
                }
                className="w-full rounded-lg border border-borderLight px-3 py-2.5 text-sm text-dark outline-none transition-colors focus:border-primary"
                placeholder="Nombres"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-dark">Apellidos</span>
              <input
                type="text"
                value={state.personalInfo.lastName}
                onChange={(event) =>
                  setPersonalInfo({
                    ...state.personalInfo,
                    lastName: event.target.value
                  })
                }
                className="w-full rounded-lg border border-borderLight px-3 py-2.5 text-sm text-dark outline-none transition-colors focus:border-primary"
                placeholder="Apellidos"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-dark">Numero de identificacion</span>
              <input
                type="text"
                value={state.personalInfo.documentNumber}
                onChange={(event) =>
                  setPersonalInfo({
                    ...state.personalInfo,
                    documentNumber: event.target.value
                  })
                }
                className="w-full rounded-lg border border-borderLight px-3 py-2.5 text-sm text-dark outline-none transition-colors focus:border-primary"
                placeholder="Numero de identificacion"
              />
            </label>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap justify-between gap-3">
        <Link to={`/onboarding/${companyId}`}>
          <Button variant="ghost">Volver</Button>
        </Link>
        <Link to={`/onboarding/${companyId}/biometria`}>
          <Button disabled={!allDocumentsValid}>Continuar</Button>
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
