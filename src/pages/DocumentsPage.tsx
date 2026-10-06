import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { useOnboarding } from '../app/OnboardingContext';
import { FileUploadCard } from '../components/onboarding/FileUploadCard';
import { Button } from '../components/ui/Button';
import { Toast } from '../components/ui/Toast';
import { buildValidationErrorResult, shouldUseS3ValidationUpload, validateDocumentFile } from '../lib/validators/documentValidators';
import { createEmptyDocument, createEmptyRepresentative } from '../app/state';
import { DocumentRecord, DocumentType, DocumentValidationResult, PersonalInfo, RepresentativeRecord } from '../app/types';
import { normalizeVenezuelanId } from '../lib/validators/venezuelanId';
import {
  getDocumentLabel,
  getDocumentOrder,
  getFlowConfig,
  requiresRepresentatives
} from '../config/onboardingCountries';
import { Card } from '../components/ui/Card';

type UploadKey = DocumentType | 'rep1' | 'rep2';

const initialBoolMap: Record<UploadKey, boolean> = {
  rif: false,
  registroMercantil: false,
  documentoIdentidad: false,
  cedulaRepresentante: false,
  documentoFiscal: false,
  documentoConstitucion: false,
  facultadesRepresentante: false,
  documentoRepresentante: false,
  comprobanteDomicilio: false,
  actaDesignacionAutoridades: false,
  licenciaConducirFrente: false,
  licenciaConducirReverso: false,
  referenciaPersonal: false,
  referenciaComercial: false,
  referenciaBancaria: false,
  rep1: false,
  rep2: false
};

const initialNumMap: Record<UploadKey, number> = {
  rif: 0,
  registroMercantil: 0,
  documentoIdentidad: 0,
  cedulaRepresentante: 0,
  documentoFiscal: 0,
  documentoConstitucion: 0,
  facultadesRepresentante: 0,
  documentoRepresentante: 0,
  comprobanteDomicilio: 0,
  actaDesignacionAutoridades: 0,
  licenciaConducirFrente: 0,
  licenciaConducirReverso: 0,
  referenciaPersonal: 0,
  referenciaComercial: 0,
  referenciaBancaria: 0,
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
  const [assemblyEnabled, setAssemblyEnabled] = useState(Boolean(state.documents.actaDesignacionAutoridades.fileName));

  const representative1 = state.representatives.find((rep) => rep.id === 1)!;
  const representative2 = state.representatives.find((rep) => rep.id === 2)!;
  const isMexicoNatural = state.country === 'mx' && state.personType === 'natural';
  const flowConfig = getFlowConfig(state.country, state.personType);
  const documentOrder = getDocumentOrder(state.country, state.personType);
  const showRepresentatives = requiresRepresentatives(state.country, state.personType);
  const isVenezuelaJuridica = state.country === 've' && state.personType === 'juridica';
  const isVenezuelaNatural = state.country === 've' && state.personType === 'natural';
  const language = state.country === 'usa' ? 'en' : 'es';
  const isEnglish = language === 'en';
  const firstNameLabel = isEnglish ? 'First name' : isMexicoNatural ? 'Nombre(s)' : 'Nombres';
  const rifValidation = state.documents.rif.validation;
  const rifCompany = rifValidation.extractedCompany;
  const hasRifCompanyData = Boolean(rifCompany?.name || rifCompany?.rif);
  const canUploadConstitution = !isVenezuelaJuridica || rifValidation.status === 'valid';
  const constitutionDisabledMessage =
    isEnglish
      ? 'Upload and validate the tax document first.'
      : 'Primero cargue y valide el RIF para comparar la razón social con el Registro Mercantil.';
  const constitutionValidation = state.documents.registroMercantil.validation;
  const assemblyValidation = state.documents.actaDesignacionAutoridades.validation;
  const legalRepresentatives = mergeLegalRepresentatives(
    constitutionValidation.extractedLegalRepresentatives,
    assemblyValidation.status === 'valid' ? assemblyValidation.extractedLegalRepresentatives : []
  );
  const canUploadRepresentative =
    !isVenezuelaJuridica || (constitutionValidation.status === 'valid' && legalRepresentatives.length > 0);
  const canUploadAssembly = !isVenezuelaJuridica || constitutionValidation.status === 'valid';
  const canUploadNaturalIdentity = !isVenezuelaNatural || ['valid', 'warning'].includes(rifValidation.status);
  const assemblyDisabledMessage = isEnglish ? 'Upload and validate the company registration first.' : 'Primero cargue y valide el Registro Mercantil.';
  const naturalIdentityDisabledMessage = isEnglish ? 'Upload and validate the tax document first.' : 'Primero cargue y valide el RIF de persona natural.';
  const representativeDisabledMessage =
    constitutionValidation.status === 'valid'
      ? isEnglish
        ? 'Upload a company registration or assembly document that identifies the board.'
        : 'Cargue un Registro Mercantil o una Asamblea donde se identifique la junta directiva.'
      : isEnglish
        ? 'Upload and validate the company registration first.'
        : 'Primero cargue y valide el Registro Mercantil.';

  async function handleUploadBase(docType: DocumentType, file: File) {
    const key: UploadKey = docType;
    if (state.personType === 'natural' && state.documents[docType].fileName && runtimeFiles[key] !== file) {
      if (docType === 'rif' || docType === 'documentoFiscal' || docType === 'documentoIdentidad' || docType === 'licenciaConducirFrente') {
        setPersonalInfo({ firstName: '', lastName: '', documentNumber: '' });
      }
      if (isVenezuelaNatural && docType === 'documentoIdentidad') {
        setPersonalInfo({ birthDate: '', nationality: '' });
      }
      if (isVenezuelaNatural && docType === 'referenciaBancaria') {
        setPersonalInfo({ bankInstitution: '', bankProduct: '', bankBalanceFigures: '' });
      }
    }
    setUploadingMap((prev) => ({ ...prev, [key]: true }));
    setUploadProgressMap((prev) => ({ ...prev, [key]: 0 }));
    setValidationProgressMap((prev) => ({ ...prev, [key]: 0 }));

    const previousPreview = state.documents[docType].previewUrl;
    let previewUrl: string | undefined;
    let fileBase64 = '';

    try {
      await simulateUpload((progress) => {
        setUploadProgressMap((prev) => ({ ...prev, [key]: progress }));
      });

      setUploadingMap((prev) => ({ ...prev, [key]: false }));
      setLoadingMap((prev) => ({ ...prev, [key]: true }));

      if (previousPreview) URL.revokeObjectURL(previousPreview);

      previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      const isReference = docType === 'referenciaPersonal' || docType === 'referenciaComercial' || docType === 'referenciaBancaria';
      fileBase64 = shouldUseS3ValidationUpload(file) ? '' : await fileToBase64(file);
      setRuntimeFiles((prev) => ({ ...prev, [key]: file }));

      let result = await validateDocumentFile(
        docType,
        file,
        state.country,
        state.personType,
        (progress) => {
          setValidationProgressMap((prev) => ({ ...prev, [key]: progress }));
        },
        getBaseValidationOptions(docType)
      );

      if (isReference && result.status !== 'error') {
        const otherDocuments = [
          ...Object.entries(state.documents).filter(([type]) => type !== docType).map(([, record]) => record),
          ...state.representatives.filter((representative) => representative.enabled).map((representative) => representative.document)
        ];
        if (otherDocuments.some((record) => record.fileBase64 && record.fileBase64 === fileBase64)) {
          result = buildValidationErrorResult('Este archivo ya se cargó en otro recaudo. Seleccione el documento de referencia correspondiente.');
        }
      }

      const nextDocument: DocumentRecord = {
        type: docType,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileBase64,
        fileS3Uri: result.fileS3Uri,
        s3Key: result.s3Key,
        previewUrl,
        validation: result
      };

      setDocument(docType, nextDocument);

      const resultAccepted = result.status === 'valid' || result.status === 'warning';
      const previousApplicantId = normalizeVenezuelanId(state.documents.rif.validation.extractedIdentity?.documentNumber || state.personalInfo.documentNumber);
      const nextApplicantId = normalizeVenezuelanId(result.extractedIdentity?.documentNumber ?? '');
      const sameApplicant = resultAccepted && previousApplicantId !== null && previousApplicantId === nextApplicantId;

      if (isVenezuelaJuridica && docType === 'rif') {
        invalidateVenezuelaJuridicaDependentDocuments();
      }

      if (isVenezuelaNatural && docType === 'rif') {
        if (state.documents.documentoIdentidad.fileName && !sameApplicant) {
          invalidateVenezuelaNaturalIdentityDocument();
        }
      }

      if (isVenezuelaJuridica && (docType === 'registroMercantil' || docType === 'actaDesignacionAutoridades')) {
        if (docType === 'registroMercantil') {
          invalidateVenezuelaJuridicaAssembly();
        }
        invalidateVenezuelaJuridicaRepresentatives({ onlyValidated: true });
      }

      if (
        state.personType === 'natural' &&
        resultAccepted &&
        (docType === 'rif' || docType === 'documentoFiscal' || docType === 'documentoIdentidad' || docType === 'licenciaConducirFrente') &&
        result.extractedIdentity
      ) {
        const personalInfo: Partial<PersonalInfo> = {};
        for (const field of ['firstName', 'lastName', 'documentNumber'] as const) {
          const value = result.extractedIdentity[field]?.trim();
          if (value) personalInfo[field] = value;
        }
        if (isVenezuelaNatural && docType === 'documentoIdentidad') {
          if (result.extractedIdentity.birthDate?.trim()) personalInfo.birthDate = result.extractedIdentity.birthDate.trim();
          if (result.extractedIdentity.nationality?.trim()) personalInfo.nationality = result.extractedIdentity.nationality.trim();
        }
        setPersonalInfo(personalInfo);
      }
      if (isVenezuelaNatural && docType === 'referenciaBancaria' && resultAccepted) {
        const bank = result.extractedBankReference;
        const personalInfo: Partial<PersonalInfo> = {};
        if (bank?.institution?.trim()) personalInfo.bankInstitution = bank.institution.trim();
        if (bank?.product?.trim()) personalInfo.bankProduct = bank.product.trim();
        if (bank?.balanceFigures?.trim()) personalInfo.bankBalanceFigures = bank.balanceFigures.trim();
        setPersonalInfo(personalInfo);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo validar el documento. Intente nuevamente.';
      setDocument(docType, {
        type: docType,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileBase64,
        previewUrl,
        validation: buildValidationErrorResult(message, ['upload_unhandled_error'])
      });
    } finally {
      setUploadingMap((prev) => ({ ...prev, [key]: false }));
      setLoadingMap((prev) => ({ ...prev, [key]: false }));
      setValidationProgressMap((prev) => ({ ...prev, [key]: 100 }));
    }
  }

  async function handleUploadRepresentative(repId: 1 | 2, file: File) {
    const key: UploadKey = repId === 1 ? 'rep1' : 'rep2';
    const currentRep = state.representatives.find((rep) => rep.id === repId)!;

    setUploadingMap((prev) => ({ ...prev, [key]: true }));
    setUploadProgressMap((prev) => ({ ...prev, [key]: 0 }));
    setValidationProgressMap((prev) => ({ ...prev, [key]: 0 }));

    let previewUrl: string | undefined;
    let fileBase64 = '';

    try {
      await simulateUpload((progress) => {
        setUploadProgressMap((prev) => ({ ...prev, [key]: progress }));
      });

      setUploadingMap((prev) => ({ ...prev, [key]: false }));
      setLoadingMap((prev) => ({ ...prev, [key]: true }));

      if (currentRep.document.previewUrl) {
        URL.revokeObjectURL(currentRep.document.previewUrl);
      }

      previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      fileBase64 = shouldUseS3ValidationUpload(file) ? '' : await fileToBase64(file);
      setRuntimeFiles((prev) => ({ ...prev, [key]: file }));

      const result = await validateDocumentFile(
        'cedulaRepresentante',
        file,
        state.country,
        state.personType,
        (progress) => {
          setValidationProgressMap((prev) => ({ ...prev, [key]: progress }));
        },
        isVenezuelaJuridica
          ? {
              expectedLegalRepresentatives: legalRepresentatives
            }
          : undefined
      );

      setRepresentative(repId, {
        ...currentRep,
        enabled: true,
        document: {
          type: 'cedulaRepresentante',
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          fileBase64,
          fileS3Uri: result.fileS3Uri,
          s3Key: result.s3Key,
          previewUrl,
          validation: result
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo validar el documento. Intente nuevamente.';
      setRepresentative(repId, {
        ...currentRep,
        enabled: true,
        document: {
          type: 'cedulaRepresentante',
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          fileBase64,
          previewUrl,
          validation: buildValidationErrorResult(message, ['upload_unhandled_error'])
        }
      });
    } finally {
      setUploadingMap((prev) => ({ ...prev, [key]: false }));
      setLoadingMap((prev) => ({ ...prev, [key]: false }));
      setValidationProgressMap((prev) => ({ ...prev, [key]: 100 }));
    }
  }

  function handleRemoveBase(docType: DocumentType) {
    const key: UploadKey = docType;
    const previous = state.documents[docType];
    if (previous.previewUrl) URL.revokeObjectURL(previous.previewUrl);

    setDocument(docType, createEmptyDocument(docType));
    clearUploaderRuntime(key);

    if (state.personType === 'natural' && (docType === 'rif' || docType === 'documentoFiscal' || docType === 'documentoIdentidad' || docType === 'licenciaConducirFrente')) {
      setPersonalInfo({ firstName: '', lastName: '', documentNumber: '' });
    }

    if (isVenezuelaNatural && docType === 'documentoIdentidad') {
      setPersonalInfo({ birthDate: '', nationality: '' });
    }
    if (isVenezuelaNatural && docType === 'rif') {
      invalidateVenezuelaNaturalIdentityDocument();
    }
    if (isVenezuelaNatural && docType === 'referenciaBancaria') {
      setPersonalInfo({ bankInstitution: '', bankProduct: '', bankBalanceFigures: '' });
    }

    if (isVenezuelaJuridica && docType === 'rif') {
      invalidateVenezuelaJuridicaDependentDocuments();
    }

    if (isVenezuelaJuridica && docType === 'registroMercantil') {
      invalidateVenezuelaJuridicaAssembly();
      invalidateVenezuelaJuridicaRepresentatives();
    }

    if (isVenezuelaJuridica && docType === 'actaDesignacionAutoridades') {
      invalidateVenezuelaJuridicaRepresentatives();
    }
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

  function handleAddAssembly() {
    setAssemblyEnabled(true);
  }

  function handleDeleteAssembly() {
    handleRemoveBase('actaDesignacionAutoridades');
    setAssemblyEnabled(false);
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

  function invalidateVenezuelaJuridicaDependentDocuments() {
    const constitution = state.documents.registroMercantil;
    if (constitution.fileName) setDocument('registroMercantil', withPendingValidation(constitution));

    invalidateVenezuelaJuridicaAssembly();
    invalidateVenezuelaJuridicaRepresentatives();
  }

  function invalidateVenezuelaJuridicaAssembly() {
    const assembly = state.documents.actaDesignacionAutoridades;
    if (assembly.fileName) setDocument('actaDesignacionAutoridades', withPendingValidation(assembly));
  }

  function invalidateVenezuelaJuridicaRepresentatives(options: { onlyValidated?: boolean } = {}) {
    [representative1, representative2].forEach((representative) => {
      if (!representative.document.fileName) return;
      if (options.onlyValidated && (!representative.enabled || representative.document.validation.status === 'pending')) return;
      setRepresentative(representative.id, {
        ...representative,
        document: withPendingValidation(representative.document)
      });
    });
  }

  function invalidateVenezuelaNaturalIdentityDocument() {
    const identity = state.documents.documentoIdentidad;
    if (identity.fileName) setDocument('documentoIdentidad', withPendingValidation(identity));
  }

  function getBaseValidationOptions(docType: DocumentType) {
    if (
      isVenezuelaJuridica &&
      (docType === 'registroMercantil' || docType === 'actaDesignacionAutoridades') &&
      hasRifCompanyData
    ) {
      return {
        expectedCompany: rifCompany
      };
    }

    if (isVenezuelaNatural && docType === 'documentoIdentidad') {
      return {
        expectedIdentity: state.documents.rif.validation.extractedIdentity
      };
    }

    return undefined;
  }

  return (
    <div className="space-y-6">
      <Toast type="info" message={flowConfig.documentsIntro} />

      <div className={state.personType === 'natural' ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_350px]' : ''}>
      <div className={`grid min-w-0 grid-cols-1 gap-4 ${state.personType === 'natural' ? 'md:grid-cols-2' : isVenezuelaJuridica ? 'lg:grid-cols-2 xl:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {documentOrder.map((docType) => {
          const constitutionUploadLocked = isVenezuelaJuridica && docType === 'registroMercantil' && !canUploadConstitution;
          const naturalIdentityUploadLocked = isVenezuelaNatural && docType === 'documentoIdentidad' && !canUploadNaturalIdentity;

          if (isVenezuelaJuridica && docType === 'registroMercantil') {
            return (
              <Card key={docType} className="relative space-y-4 animate-fadeUp">
                <div className="space-y-2">
                  <h3 className="pr-24 text-lg font-semibold text-dark">Registro Mercantil</h3>
                  <p className="text-sm text-grayText">
                    Cargue el Registro Mercantil. Puede agregar una asamblea si complementa o actualiza la información de la empresa.
                  </p>
                </div>

                <FileUploadCard
                  docRecord={state.documents.registroMercantil as DocumentRecord}
                  title="Registro Mercantil"
                  label={getDocumentLabel(state.country, state.personType, 'registroMercantil')}
                  loading={loadingMap.registroMercantil || uploadingMap.registroMercantil}
                  isUploading={uploadingMap.registroMercantil}
                  uploadProgress={uploadProgressMap.registroMercantil}
                  validationProgress={validationProgressMap.registroMercantil}
                  previewFile={runtimeFiles.registroMercantil}
                  disabled={constitutionUploadLocked}
                  disabledMessage={constitutionDisabledMessage}
                  embedded
                  hideTitle
                  language={language}
                  onSelectFile={(file) => handleUploadBase('registroMercantil', file)}
                  onRemoveFile={() => handleRemoveBase('registroMercantil')}
                />

                {!assemblyEnabled ? (
                  <div className="border-t border-borderLight pt-4">
                    <Button type="button" variant="secondary" fullWidth className="gap-2" onClick={handleAddAssembly} disabled={!canUploadAssembly}>
                      <Plus className="h-4 w-4" />
                      Agregar acta de asamblea
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 border-t border-borderLight pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-base font-semibold text-dark">Acta de Asamblea</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 w-11 rounded-lg border border-borderLight bg-white px-0 text-grayText shadow-sm hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        aria-label="Quitar asamblea"
                        title="Quitar asamblea"
                        onClick={handleDeleteAssembly}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                    <FileUploadCard
                      docRecord={state.documents.actaDesignacionAutoridades as DocumentRecord}
                      title="Acta de Asamblea (Opcional)"
                      label={getDocumentLabel(state.country, state.personType, 'actaDesignacionAutoridades')}
                      loading={loadingMap.actaDesignacionAutoridades || uploadingMap.actaDesignacionAutoridades}
                      isUploading={uploadingMap.actaDesignacionAutoridades}
                      uploadProgress={uploadProgressMap.actaDesignacionAutoridades}
                      validationProgress={validationProgressMap.actaDesignacionAutoridades}
                      previewFile={runtimeFiles.actaDesignacionAutoridades}
                      disabled={!canUploadAssembly}
                      disabledMessage={assemblyDisabledMessage}
                      embedded
                      hideTitle
                      language={language}
                      onSelectFile={(file) => handleUploadBase('actaDesignacionAutoridades', file)}
                      onRemoveFile={() => handleRemoveBase('actaDesignacionAutoridades')}
                    />
                  </div>
                )}
              </Card>
            );
          }

          return (
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
              disabled={constitutionUploadLocked || naturalIdentityUploadLocked}
              disabledMessage={naturalIdentityUploadLocked ? naturalIdentityDisabledMessage : constitutionDisabledMessage}
              language={language}
              onSelectFile={(file) => handleUploadBase(docType, file)}
              onRemoveFile={() => handleRemoveBase(docType)}
            />
          );
        })}

        {showRepresentatives ? (
          <Card className="relative space-y-4 animate-fadeUp">
            <div className="space-y-2">
              <h3 className="pr-24 text-lg font-semibold text-dark">{flowConfig.representativeSectionTitle}</h3>
              {flowConfig.representativeSectionDescription ? (
                <p className="text-sm text-grayText">{flowConfig.representativeSectionDescription}</p>
              ) : null}
            </div>

            <FileUploadCard
              title={flowConfig.representativePrimaryTitle}
              label={getDocumentLabel(state.country, state.personType, 'cedulaRepresentante')}
              docRecord={{ ...representative1.document, type: 'cedulaRepresentante' }}
              loading={loadingMap.rep1 || uploadingMap.rep1}
              isUploading={uploadingMap.rep1}
              uploadProgress={uploadProgressMap.rep1}
              validationProgress={validationProgressMap.rep1}
              previewFile={runtimeFiles.rep1}
              disabled={!canUploadRepresentative}
              disabledMessage={representativeDisabledMessage}
              embedded
              language={language}
              onSelectFile={(file) => handleUploadRepresentative(1, file)}
              onRemoveFile={() => handleRemoveRepresentative(1)}
            />

            {!representative2.enabled ? (
              <div className="border-t border-borderLight pt-4">
                <Button type="button" variant="secondary" fullWidth className="gap-2" onClick={handleAddRepresentative2}>
                  <Plus className="h-4 w-4" />
                  {flowConfig.addSecondRepresentativeLabel}
                </Button>
              </div>
            ) : (
              <div className="space-y-4 border-t border-borderLight pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-base font-semibold text-dark">{flowConfig.representativeSecondaryTitle}</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 w-11 rounded-lg border border-borderLight bg-white px-0 text-grayText shadow-sm hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                    aria-label={flowConfig.removeSecondRepresentativeLabel}
                    title={flowConfig.removeSecondRepresentativeLabel}
                    onClick={handleDeleteRepresentative2}
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
                <FileUploadCard
                  title="Segundo representante"
                  label={getDocumentLabel(state.country, state.personType, 'cedulaRepresentante')}
                  docRecord={{ ...representative2.document, type: 'cedulaRepresentante' }}
                  loading={loadingMap.rep2 || uploadingMap.rep2}
                  isUploading={uploadingMap.rep2}
                  uploadProgress={uploadProgressMap.rep2}
                  validationProgress={validationProgressMap.rep2}
                  previewFile={runtimeFiles.rep2}
                  disabled={!canUploadRepresentative}
                  disabledMessage={representativeDisabledMessage}
                  embedded
                  language={language}
                  onSelectFile={(file) => handleUploadRepresentative(2, file)}
                  onRemoveFile={() => handleRemoveRepresentative(2)}
                />
              </div>
            )}
          </Card>
        ) : null}
      </div>

      {state.personType === 'natural' ? (
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-28 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto" aria-label={isEnglish ? 'Identity details' : 'Datos de identidad'}>
        <Card>
          <h3 className="text-lg font-semibold text-dark">Datos de identidad</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <label className="space-y-2">
              <span className="text-sm font-medium text-dark">{firstNameLabel}</span>
              <input
                type="text"
                value={state.personalInfo.firstName}
                onChange={(event) =>
                  setPersonalInfo({
                    firstName: event.target.value
                  })
                }
                className="w-full rounded-lg border border-borderLight px-3 py-2.5 text-sm text-dark outline-none transition-colors focus:border-primary"
                placeholder={firstNameLabel}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-dark">{isEnglish ? 'Last name' : 'Apellidos'}</span>
              <input
                type="text"
                value={state.personalInfo.lastName}
                onChange={(event) =>
                  setPersonalInfo({
                    lastName: event.target.value
                  })
                }
                className="w-full rounded-lg border border-borderLight px-3 py-2.5 text-sm text-dark outline-none transition-colors focus:border-primary"
                placeholder={isEnglish ? 'Last name' : 'Apellidos'}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-dark">{isEnglish ? 'Identification number' : 'Número de identificación'}</span>
              <input
                type="text"
                value={state.personalInfo.documentNumber}
                onChange={(event) =>
                  setPersonalInfo({
                    documentNumber: event.target.value
                  })
                }
                className="w-full rounded-lg border border-borderLight px-3 py-2.5 text-sm text-dark outline-none transition-colors focus:border-primary"
                placeholder={isEnglish ? 'Identification number' : 'Número de identificación'}
              />
            </label>
          </div>
          {isVenezuelaNatural ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <label className="space-y-2">
                <span className="text-sm font-medium text-dark">Fecha de nacimiento</span>
                <input type="date" value={state.personalInfo.birthDate} onChange={event => setPersonalInfo({ birthDate: event.target.value })} className="w-full min-w-0 rounded-lg border border-borderLight px-3 py-2.5 text-sm text-dark outline-none focus:border-primary" />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-dark">Nacionalidad</span>
                <input type="text" maxLength={100} value={state.personalInfo.nationality} onChange={event => setPersonalInfo({ nationality: event.target.value })} className="w-full rounded-lg border border-borderLight px-3 py-2.5 text-sm text-dark outline-none focus:border-primary" />
              </label>
            </div>
          ) : null}
        </Card>
        {isVenezuelaNatural ? (
          <Card>
            <h3 className="text-lg font-semibold text-dark">Datos bancarios</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {([
                ['bankInstitution', 'Institución bancaria'],
                ['bankProduct', 'Producto bancario'],
                ['bankBalanceFigures', 'Cifras del saldo']
              ] as const).map(([field, label]) => (
                <label key={field} className="space-y-2">
                  <span className="text-sm font-medium text-dark">{label}</span>
                  <input type="text" maxLength={200} value={state.personalInfo[field]} onChange={event => setPersonalInfo({ [field]: event.target.value })} className="w-full rounded-lg border border-borderLight px-3 py-2.5 text-sm text-dark outline-none focus:border-primary" />
                </label>
              ))}
            </div>
          </Card>
        ) : null}
        </aside>
      ) : null}
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <Link to={`/onboarding/${companyId}/tipo-persona`}>
          <Button variant="ghost">{isEnglish ? 'Back' : 'Volver'}</Button>
        </Link>
        <Link to={`/onboarding/${companyId}/biometria`}>
          <Button disabled={!allDocumentsValid}>{isEnglish ? 'Continue' : 'Continuar'}</Button>
        </Link>
      </div>
    </div>
  );
}

function withPendingValidation(record: DocumentRecord): DocumentRecord {
  return {
    ...record,
    validation: {
      ...record.validation,
      status: 'pending',
      checks: [],
      warnings: [],
      reasons: [],
      failureKind: undefined,
      internalDiagnostics: ['dependency_changed'],
      uiStatus: { state: 'ok', title: 'Revalidación requerida', message: 'Un documento relacionado cambió. Vuelva a validar este archivo.' }
    }
  };
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',', 2)[1] : result;
      if (!base64) {
        reject(new Error('No se pudo codificar el archivo.'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function mergeLegalRepresentatives(
  primary: DocumentValidationResult['extractedLegalRepresentatives'] = [],
  secondary: DocumentValidationResult['extractedLegalRepresentatives'] = []
) {
  const seen = new Set<string>();
  return [...primary, ...secondary].filter((representative) => {
    const key =
      representative.documentNumber?.replace(/\D/g, '') ||
      `${representative.firstName ?? ''}-${representative.lastName ?? ''}-${representative.role ?? ''}`.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
