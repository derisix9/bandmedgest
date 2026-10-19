import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Spinner } from '../components/Spinner';
import { SchoolDatabase, Student, UserRole, AttachedDocument, Matricula, MatriculaTipo, MatriculaEstado, MatriculaTipoAluno } from '../types';
import { dbService } from '../services/db';
import { AsyncButton } from '../components/AsyncButton';
import { runGlobalOperation } from '../context/OperationContext';
import { OperationStatusModal } from '../components/OperationStatusModal';
import { compressImageFile } from '../utils/imageCompressor';
import { getAllocatedClassIdsForUser } from '../utils/teacherSubjects';
import { hasPermission } from '../utils/permissions';
import { useAccessControl } from '../hooks/useAccessControl';
import { StudentFichaSections, FichaExtraData, createEmptyFichaExtra, fichaExtraFromStudent } from '../components/StudentFichaSections';
import { StudentHistoryModal } from '../components/StudentHistoryModal';
import { StudentYearRecordModal } from '../components/StudentYearRecordModal';
import { MatriculaModal } from '../components/MatriculaModal';
import { sortByName } from '../utils/alphabetical';
import { getFallbackAcademicYear } from '../utils/academicYear';
import { resolveStudentSituation } from '../utils/studentSituation';
import { findDuplicatePerson, duplicateMessage } from '../utils/duplicatePerson';

interface AlunosViewProps {
  db: SchoolDatabase;
  currentUserRole: UserRole;
  onOpenReportCard: (student: Student) => void;
  /**
   * 'cadastro'   -> Secção "Alunos": apenas registo de dados pessoais/documentais
   *                 do aluno. Serve de base para a Matrícula, mas NÃO define
   *                 turma nem plano financeiro (ficam com valores por defeito
   *                 até serem confirmados na secção Matrículas).
   * 'matriculas' -> Secção "Matrículas": não permite criar alunos novos, apenas
   *                 matricular (definir turma, propina e estado financeiro)
   *                 alunos já cadastrados.
   */
  mode?: 'cadastro' | 'matriculas';
  /** Aluno pré-seleccionado ao chegar da secção Alunos (botão "Matricular"/"Nova Matrícula"). */
  initialStudentId?: string;
  /** Pede à app para mudar para a secção Matrículas com este aluno seleccionado. */
  onNavigateToMatriculas?: (studentId: string) => void;
}

const DEFAULT_SAMPLE_PHOTOS = [
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
];

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const AlunosView: React.FC<AlunosViewProps> = ({
  db,
  currentUserRole,
  onOpenReportCard,
  mode = 'cadastro',
  initialStudentId,
  onNavigateToMatriculas
}) => {
  // Matriz ACL (Configurações → Perfis & Permissões): matricular, editar,
  // eliminar e emitir documentos do aluno deixam de depender do cargo fixo.
  const acl = useAccessControl(currentUserRole);
  const isMatriculaMode = mode === 'matriculas';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedFinanceStatus, setSelectedFinanceStatus] = useState<string>('all');
  const [selectedGender, setSelectedGender] = useState<string>('all');
  const [tableTab, setTableTab] = useState<'geral' | 'biografico' | 'historico_docs'>('geral');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [studentDocMode, setStudentDocMode] = useState<'ficha' | 'cartao'>('ficha');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  // Dados extra da Ficha do Aluno (Filiação, Residência, Proveniência Escolar
  // detalhada, Situação/NEE) — vivem sempre no Cadastro, nunca na Matrícula.
  const [fichaExtra, setFichaExtra] = useState<FichaExtraData>(createEmptyFichaExtra());
  // Aluno seleccionado para a Modal de Matrícula (secção Matrículas).
  const [matriculaStudent, setMatriculaStudent] = useState<Student | null>(null);
  // Edição de uma matrícula já gravada (botão "Editar matrícula" na secção Matrículas).
  const [editingMatricula, setEditingMatricula] = useState<{ student: Student; matricula: Matricula } | null>(null);
  // Aluno seleccionado para a Modal de Histórico Escolar (dentro da instituição).
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  // Matrícula seleccionada para a Vista do Aluno naquele Ano Lectivo (relatórios).
  const [yearViewMatricula, setYearViewMatricula] = useState<Matricula | null>(null);

  // Refs de carregamento de ficheiros
  const fileInputRef = useRef<HTMLInputElement>(null);
  const biFileInputRef = useRef<HTMLInputElement>(null);
  const certFileInputRef = useRef<HTMLInputElement>(null);
  const otherDocsInputRef = useRef<HTMLInputElement>(null);

  // Form State com todos os campos solicitados e documentos reais
  const [formData, setFormData] = useState({
    name: '',
    procNumber: '',
    gender: 'Masculino' as 'Masculino' | 'Feminino' | string,
    biNumber: '',
    nationality: 'Angolana',
    birthPlace: 'Luanda',
    birthDate: '2008-05-10',
    address: 'Bairro Morro Bento, Luanda',
    studentPhone: '+244 923 000 000',
    email: '',
    // Turma, Curso, Propina e Situação Financeira NÃO fazem parte da ficha do
    // Aluno — são colunas exclusivas da Matrícula (ver `Matricula` em
    // types/index.ts e `MatriculaModal`). O Cadastro do Aluno grava apenas os
    // dados de identificação/documentos abaixo; a turma só é definida ao
    // confirmar uma Matrícula, que também é quem actualiza o instantâneo
    // (classId/className/financialStatus/monthlyTuitionKz) na ficha do Aluno.
    // 5. DOCUMENTOS
    docBiCopy: 'Entregue' as 'Entregue' | 'Pendente' | 'Dispensado' | string,
    docCertificate: 'Entregue' as 'Entregue' | 'Declaração Provisória' | 'Pendente' | string,
    docPassPhoto: DEFAULT_SAMPLE_PHOTOS[0],
    docBiFile: null as AttachedDocument | null,
    docCertificateFile: null as AttachedDocument | null,
    additionalDocs: [] as AttachedDocument[]
  });

  const studentList = db.students || [];
  const filteredStudents = useMemo(() => {
    // Ordem alfabética (A–Z) pelo nome do aluno — vale para Cadastro e Matrículas.
    return sortByName(studentList, (s) => s.name).filter((s) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        !q ||
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.procNumber && s.procNumber.toLowerCase().includes(q)) ||
        (s.biNumber && s.biNumber.toLowerCase().includes(q)) ||
        (s.citizenCard && s.citizenCard.toLowerCase().includes(q)) ||
        (s.studentPhone && s.studentPhone.toLowerCase().includes(q)) ||
        (s.guardianName && s.guardianName.toLowerCase().includes(q)) ||
        (s.guardianPhone && s.guardianPhone.toLowerCase().includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q)) ||
        (s.birthPlace && s.birthPlace.toLowerCase().includes(q)) ||
        (s.previousSchool && s.previousSchool.toLowerCase().includes(q));

      const matchesClass = selectedClassId === 'all' || String(s.classId) === selectedClassId;
      const matchesFinance = selectedFinanceStatus === 'all' || s.financialStatus === selectedFinanceStatus;
      const matchesGender =
        selectedGender === 'all' ||
        (selectedGender === 'M' && (s.gender === 'Masculino' || s.gender === 'M')) ||
        (selectedGender === 'F' && (s.gender === 'Feminino' || s.gender === 'F'));

      return matchesSearch && matchesClass && matchesFinance && matchesGender;
    });
  }, [studentList, searchTerm, selectedClassId, selectedFinanceStatus, selectedGender]);

  useEffect(() => {
    if (!isMatriculaMode || !initialStudentId) return;
    const preselected = db.students.find((s) => s.id === initialStudentId);
    if (preselected) setMatriculaStudent(preselected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMatriculaMode, initialStudentId]);

  const handleOpenAdd = () => {
    setEditingStudent(null);
    setSubmitStatus('idle');
    const randomPhoto = DEFAULT_SAMPLE_PHOTOS[Math.floor(Math.random() * DEFAULT_SAMPLE_PHOTOS.length)];

    setFormData({
      name: '',
      // Não inventa número de processo: fica vazio para o sistema atribuir a
      // numeração sequencial real (ver addStudent em db.ts) ao gravar.
      procNumber: '',
      gender: 'Masculino',
      biNumber: '',
      nationality: 'Angolana',
      birthPlace: 'Luanda',
      birthDate: '2008-05-10',
      address: 'Bairro Morro Bento, Rua Direita, Luanda',
      studentPhone: '+244 923 000 000',
      email: '',
      docBiCopy: 'Entregue',
      docCertificate: 'Entregue',
      docPassPhoto: randomPhoto,
      docBiFile: null,
      docCertificateFile: null,
      additionalDocs: []
    });
    setFichaExtra(createEmptyFichaExtra());
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setSubmitStatus('idle');
    const photo = student.docPassPhoto || student.avatar || DEFAULT_SAMPLE_PHOTOS[0];
    setFormData({
      name: student.name || '',
      procNumber: student.procNumber || '',
      gender: student.gender || 'Masculino',
      biNumber: student.biNumber || student.citizenCard || '',
      nationality: student.nationality || 'Angolana',
      birthPlace: student.birthPlace || 'Luanda',
      birthDate: student.birthDate || '2008-05-10',
      address: student.address || 'Luanda, Angola',
      studentPhone: student.studentPhone || '+244 923 000 000',
      email: student.email || '',
      docBiCopy: student.docBiCopy || 'Entregue',
      docCertificate: student.docCertificate || 'Entregue',
      docPassPhoto: photo,
      docBiFile: student.docBiFile || null,
      docCertificateFile: student.docCertificateFile || null,
      additionalDocs: student.additionalDocs || []
    });
    setFichaExtra(fichaExtraFromStudent(student));
    setIsModalOpen(true);
  };

  const handlePhotoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, 480, 480, 0.82);
        setFormData((prev) => ({
          ...prev,
          docPassPhoto: compressed
        }));
      } catch {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setFormData((prev) => ({
              ...prev,
              docPassPhoto: reader.result as string
            }));
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleBiFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('O ficheiro do B.I. / Passaporte excede o limite máximo permitido de 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const attached: AttachedDocument = {
          id: `bi-${Date.now()}`,
          name: file.name,
          size: file.size,
          type: file.type || 'application/pdf',
          uploadDate: new Date().toLocaleDateString('pt-PT'),
          dataUrl: reader.result
        };
        setFormData((prev) => ({
          ...prev,
          docBiCopy: 'Entregue',
          docBiFile: attached
        }));
      }
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  };

  const handleRemoveBiFile = () => {
    setFormData((prev) => ({
      ...prev,
      docBiFile: null
    }));
  };

  const handleCertFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('O ficheiro do Certificado excede o limite máximo permitido de 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const attached: AttachedDocument = {
          id: `cert-${Date.now()}`,
          name: file.name,
          size: file.size,
          type: file.type || 'application/pdf',
          uploadDate: new Date().toLocaleDateString('pt-PT'),
          dataUrl: reader.result
        };
        setFormData((prev) => ({
          ...prev,
          docCertificate: 'Entregue',
          docCertificateFile: attached
        }));
      }
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  };

  const handleRemoveCertFile = () => {
    setFormData((prev) => ({
      ...prev,
      docCertificateFile: null
    }));
  };

  const handleAdditionalDocsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const currentCount = (formData.additionalDocs || []).length;
    if (currentCount + files.length > 3) {
      alert(`Pode anexar no máximo 3 documentos adicionais no total. Já possui ${currentCount} documento(s) anexado(s).`);
      return;
    }

    // Validate size and types
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        alert(`O ficheiro "${file.name}" excede o limite de 5MB.`);
        return;
      }
      const isValid = file.type === 'application/pdf' || file.type.startsWith('image/');
      if (!isValid) {
        alert(`O ficheiro "${file.name}" não é suportado. Carregue ficheiros PDF ou Imagens (JPEG/PNG).`);
        return;
      }
    }

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          const doc: AttachedDocument = {
            id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: file.name,
            size: file.size,
            type: file.type || 'application/pdf',
            uploadDate: new Date().toLocaleDateString('pt-PT'),
            dataUrl: reader.result
          };
          setFormData((prev) => ({
            ...prev,
            additionalDocs: [...(prev.additionalDocs || []), doc]
          }));
        }
      };
      reader.readAsDataURL(file);
    });

    if (e.target) e.target.value = '';
  };

  const handleRemoveAdditionalDoc = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      additionalDocs: (prev.additionalDocs || []).filter((d) => d.id !== id)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitStatus !== 'idle') return;

    // Matriz ACL: matricular exige alunos.create; alterar uma ficha existente
    // exige alunos.edit. As duas regras vivem em Configurações → Permissões.
    const requiredRule = editingStudent ? 'alunos.edit' : 'alunos.create';
    if (!acl.can(requiredRule)) {
      acl.guard(requiredRule, () => undefined);
      return;
    }

    // Impedimento de duplicados: mesmo nome completo + mesmo n.º de documento (B.I., passaporte, cédula...).
    const duplicate = findDuplicatePerson(
      db.students,
      { name: formData.name, docs: [formData.biNumber] },
      (s) => ({ id: s.id, name: s.name, docs: [s.biNumber, s.citizenCard] }),
      editingStudent?.id
    );
    if (duplicate) {
      alert(duplicateMessage('aluno', duplicate.name));
      return;
    }

    setSubmitStatus('loading');
    const photo = formData.docPassPhoto || DEFAULT_SAMPLE_PHOTOS[0];

    // Espelha os dados de Filiação/Proveniência Escolar (secções 1B e 3, únicas
    // fontes editáveis) para os campos "legados" (guardianName, previousSchool...)
    // que várias outras vistas (Portal do Encarregado, Faturas, Comunicados,
    // Boletins) ainda leem diretamente. Evita duplicar os mesmos dados em dois
    // blocos diferentes do formulário.
    const guardian = fichaExtra.filiation.guardian;
    const guardianLegacy = {
      guardianName: guardian.name || '',
      guardianRelation: guardian.relation || 'Encarregado de Educação',
      guardianPhone: guardian.phone || '',
      guardianEmail: guardian.email || ''
    };
    const RESULT_TO_SITUACAO: Record<string, string> = {
      Aprovado: 'Transitado',
      Reprovado: 'Reprovado',
      Transferido: 'Transferido',
      Desistente: 'Desistente'
    };
    const prevSchool = fichaExtra.previousSchoolDetails;
    const previousSchoolLegacy = {
      previousSchool: prevSchool.school || '',
      lastCompletedGrade: prevSchool.completedGrade || prevSchool.lastGrade || '',
      academicSituation: RESULT_TO_SITUACAO[prevSchool.result] || prevSchool.result
    };

    setTimeout(() => {
      if (editingStudent) {
        dbService.updateStudent(editingStudent.id, {
          name: formData.name,
          procNumber: formData.procNumber,
          gender: formData.gender,
          biNumber: formData.biNumber,
          citizenCard: formData.biNumber,
          nationality: formData.nationality,
          birthPlace: formData.birthPlace,
          birthDate: formData.birthDate,
          address: formData.address,
          studentPhone: formData.studentPhone,
          email: formData.email,
          // Turma, Propina e Situação Financeira NÃO são geridas por este
          // formulário — pertencem exclusivamente à Matrícula (ver
          // `dbService.confirmMatricula`, que actualiza este instantâneo
          // sempre que uma nova Matrícula é confirmada).
          ...guardianLegacy,
          ...previousSchoolLegacy,
          docBiCopy: formData.docBiCopy,
          docCertificate: formData.docCertificate,
          docPassPhoto: photo,
          avatar: photo,
          docBiFile: formData.docBiFile || undefined,
          docCertificateFile: formData.docCertificateFile || undefined,
          additionalDocs: formData.additionalDocs || [],
          socialName: fichaExtra.socialName || undefined,
          birthMunicipality: fichaExtra.birthMunicipality || undefined,
          birthProvince: fichaExtra.birthProvince || undefined,
          birthCountry: fichaExtra.birthCountry || undefined,
          maritalStatus: fichaExtra.maritalStatus || undefined,
          docType: fichaExtra.docType || undefined,
          docValidUntil: fichaExtra.docValidUntil || undefined,
          naturalidade: fichaExtra.naturalidade || undefined,
          filiation: fichaExtra.filiation,
          residence: fichaExtra.residence,
          previousSchoolDetails: fichaExtra.previousSchoolDetails,
          studentSituation: fichaExtra.studentSituation,
          specialNeeds: fichaExtra.specialNeeds
        });
      } else {
        dbService.addStudent({
          name: formData.name,
          procNumber: formData.procNumber,
          gender: formData.gender,
          biNumber: formData.biNumber,
          citizenCard: formData.biNumber,
          nationality: formData.nationality,
          birthPlace: formData.birthPlace,
          birthDate: formData.birthDate,
          address: formData.address,
          studentPhone: formData.studentPhone,
          email: formData.email || `${formData.name.toLowerCase().replace(/\s+/g, '.')}@bandmed.edu.pt`,
          // Sem NIF real fornecido nesta ficha — nunca inventa um número fiscal.
          nif: '',
          // Turma, Curso, Propina e Situação Financeira são colunas exclusivas
          // da Matrícula. Um Aluno recém-cadastrado ainda não tem nenhuma —
          // ficam vazias/neutras até a secretaria confirmar a 1.ª Matrícula
          // (`MatriculaModal` → `dbService.confirmMatricula`), que é quem
          // preenche este instantâneo com dados reais da turma escolhida.
          classId: '',
          className: '',
          section: '',
          cycle: '',
          grade: '',
          ...guardianLegacy,
          guardianNif: '',
          monthlyTuitionKz: 0,
          financialStatus: 'regular',
          ...previousSchoolLegacy,
          docBiCopy: formData.docBiCopy,
          docCertificate: formData.docCertificate,
          docPassPhoto: photo,
          avatar: photo,
          docBiFile: formData.docBiFile || undefined,
          docCertificateFile: formData.docCertificateFile || undefined,
          additionalDocs: formData.additionalDocs || [],
          socialName: fichaExtra.socialName || undefined,
          birthMunicipality: fichaExtra.birthMunicipality || undefined,
          birthProvince: fichaExtra.birthProvince || undefined,
          birthCountry: fichaExtra.birthCountry || undefined,
          maritalStatus: fichaExtra.maritalStatus || undefined,
          docType: fichaExtra.docType || undefined,
          docValidUntil: fichaExtra.docValidUntil || undefined,
          naturalidade: fichaExtra.naturalidade || undefined,
          filiation: fichaExtra.filiation,
          residence: fichaExtra.residence,
          previousSchoolDetails: fichaExtra.previousSchoolDetails,
          studentSituation: fichaExtra.studentSituation,
          specialNeeds: fichaExtra.specialNeeds,
          // 'pending': cadastrado mas ainda sem Matrícula confirmada. Passa a
          // 'active' automaticamente quando `confirmMatricula` é executado.
          status: 'pending',
          unexcusedAbsences: 0,
          excusedAbsences: 0,
          isTuitionPaidCurrentMonth: true,
          // Um aluno acabado de cadastrar ainda não tem nenhuma nota lançada.
          // Nunca se inventam notas de partida — ficam vazias até haver avaliação real.
          disciplineGrades: []
        });
      }
      setSubmitStatus('success');
      setTimeout(() => {
        setIsModalOpen(false);
        setSubmitStatus('idle');
      }, 1200);
    }, 600);
  };

  return (
    <div className="flex flex-col w-full gap-6 pb-12 rounded-none">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-300 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              {isMatriculaMode ? 'MATRÍCULAS • ALUNOS' : 'CADASTRO • ALUNOS'}
            </span>
            <span className="w-1.5 h-1.5 bg-[#0b1f3a]" />
            <span className="text-xs font-semibold text-[#0b1f3a]">
              {isMatriculaMode ? 'MATRÍCULAS DE ALUNOS' : 'CADASTRO DE ALUNOS'}
            </span>
          </div>
          <h1 className="font-headline text-2xl lg:text-3xl font-extrabold text-[#0b1f3a] tracking-tight">
            {isMatriculaMode ? 'CADASTRAR MATRÍCULA' : 'CADASTRAR ALUNO'}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isMatriculaMode && acl.can('alunos.create') && (
            <button
              onClick={() => acl.guard('alunos.create', () => handleOpenAdd())}
              className="flex items-center gap-2 px-5 py-2.5 rounded-none bg-[#0b1f3a] hover:bg-[#7a0c0c] active:scale-[0.99] transition-all text-white font-bold text-xs shadow-none shrink-0 cursor-pointer border border-[#0b1f3a]"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              <span>CADASTRAR</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar & Tabs */}
      <div className="bg-white p-4 rounded-none border border-slate-300 flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex items-center flex-1 max-w-md border border-slate-400/30 bg-slate-50/60 rounded-none focus-within:border-slate-400/70 focus-within:bg-white transition-colors">
            <span className="material-symbols-outlined ml-3 text-slate-400 text-[18px] shrink-0">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por nome, processo, BI, telefone, encarregado, escola..."
              className="w-full h-9 pl-2 pr-3 bg-transparent border-0 border-none outline-none focus:ring-0 text-xs text-slate-800 placeholder:text-slate-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="h-9 px-3 rounded-none bg-slate-50 text-xs font-semibold text-slate-700 border border-slate-300 focus:border-[#0b1f3a]"
            >
              <option value="all">Todas as Turmas</option>
              {db.classes.map((c) => (
                <option key={c.id} value={c.id.toString()}>
                  {c.name} ({c.shift})
                </option>
              ))}
            </select>

            <select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
              className="h-9 px-3 rounded-none bg-slate-50 text-xs font-semibold text-slate-700 border border-slate-300 focus:border-[#0b1f3a]"
            >
              <option value="all">Todos os Géneros</option>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>

            <select
              value={selectedFinanceStatus}
              onChange={(e) => setSelectedFinanceStatus(e.target.value)}
              className="h-9 px-3 rounded-none bg-slate-50 text-xs font-semibold text-slate-700 border border-slate-300 focus:border-[#0b1f3a]"
            >
              <option value="all">Todos os Estados Financeiros</option>
              <option value="regular">Regular (Sem Mora)</option>
              <option value="debito">Em Débito (Mora)</option>
              <option value="isento">Isento / Bolseiro</option>
            </select>

            <span className="text-xs text-slate-500 font-mono pl-2">
              {filteredStudents.length} {filteredStudents.length === 1 ? 'aluno' : 'alunos'}
            </span>
          </div>
        </div>

        {/* View mode tabs for detailed columns — apenas no Cadastro. As Matrículas
            têm as suas próprias colunas (ver abaixo), tiradas da Matrícula, não do
            Cadastro do Aluno. */}
        {!isMatriculaMode && (
        <div className="flex items-center gap-2 border-t border-slate-200 pt-2.5">
          <span className="text-[11px] font-bold uppercase text-slate-500 mr-1">Navegar para:</span>
          <button
            onClick={() => setTableTab('geral')}
            className={`px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer border ${
              tableTab === 'geral'
                ? 'bg-[#0b1f3a] text-white border-[#0b1f3a]'
                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
            }`}
          >
            Dados Pessoais
          </button>
          <button
            onClick={() => setTableTab('biografico')}
            className={`px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer border ${
              tableTab === 'biografico'
                ? 'bg-[#0b1f3a] text-white border-[#0b1f3a]'
                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
            }`}
          >
            Dados Adicionais
          </button>
          <button
            onClick={() => setTableTab('historico_docs')}
            className={`px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer border ${
              tableTab === 'historico_docs'
                ? 'bg-[#0b1f3a] text-white border-[#0b1f3a]'
                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
            }`}
          >
            Documentos
          </button>
        </div>
        )}
      </div>

      {/* Main Table - Cantos Totalmente Quadrados */}
      <div className="bg-white rounded-none border border-slate-300 overflow-hidden shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0b1f3a] text-white font-bold uppercase text-[11px] tracking-wider border-b border-slate-800">
                <th className="py-3 px-4 text-white border-r border-slate-800/40">Foto & Aluno</th>

                {isMatriculaMode ? (
                  <>
                    <th className="py-3 px-3 text-white border-r border-slate-800/40">Nº Matrícula & Ano Lectivo</th>
                    <th className="py-3 px-3 text-white border-r border-slate-800/40">Turma (Classe/Curso/Turno/Sala)</th>
                    <th className="py-3 px-3 text-white border-r border-slate-800/40">Tipo & Estado da Matrícula</th>
                    <th className="py-3 px-3 text-white border-r border-slate-800/40">Tipo de Aluno & Situação Financeira</th>
                    <th className="py-3 px-3 text-white border-r border-slate-800/40">Propina & Desconto</th>
                  </>
                ) : (
                  <>
                    {tableTab === 'geral' && (
                      <>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">BI / Passaporte & Género</th>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">Nascimento & Naturalidade</th>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">Contacto (Tel. / E-mail)</th>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">Encarregado & Parentesco</th>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">Situação do Aluno</th>
                      </>
                    )}

                    {tableTab === 'biografico' && (
                      <>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">Género & N.º BI / Passaporte</th>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">Nacionalidade & Naturalidade</th>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">Endereço / Bairro</th>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">Tel. Aluno</th>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">Encarregado (Parentesco)</th>
                      </>
                    )}

                    {tableTab === 'historico_docs' && (
                      <>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">Escola de Proveniência</th>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">Classe Concluída & Situação</th>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">Cópia do BI/Passaporte</th>
                        <th className="py-3 px-3 text-white border-r border-slate-800/40">Certificado</th>
                        <th className="py-3 px-3 text-center text-white border-r border-slate-800/40">Foto Tipo Passe</th>
                      </>
                    )}
                  </>
                )}

                <th className="py-3 px-4 text-right text-white">Ações Oficiais</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 text-xs">
                    Nenhum registo de aluno encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const studentPhoto = student.docPassPhoto || student.avatar || DEFAULT_SAMPLE_PHOTOS[0];
                  const genderLabel = student.gender === 'Feminino' || student.gender === 'F' ? 'Feminino' : 'Masculino';
                  const docBi = student.docBiCopy || 'Entregue';
                  const docCert = student.docCertificate || 'Entregue';
                  // A Matrícula tem o seu próprio histórico (Matricula), independente
                  // da ficha do Aluno — usamos sempre a mais recente deste aluno.
                  const ultimaMatricula = isMatriculaMode ? dbService.getMatriculasByStudent(student.id)[0] : undefined;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50 transition-colors border-b border-slate-200">
                      {/* Foto Tipo Passe e Aluno */}
                      <td className="py-3 px-4 border-r border-slate-200">
                        <div className="flex items-center gap-3">
                          {/* Fotografia tipo passe quadrada */}
                          <div className="relative w-11 h-13 shrink-0 bg-slate-100 border border-slate-300 overflow-hidden shadow-none">
                            <img
                              src={studentPhoto}
                              alt={student.name}
                              className="w-full h-full object-cover object-center"
                            />
                          </div>
                          <div>
                            <div className="font-bold text-[#0b1f3a] text-sm leading-snug">{student.name}</div>
                            <div className="flex flex-wrap items-center gap-1.5 text-slate-500 text-[11px] font-mono mt-0.5">
                              <span className="font-bold text-slate-700">Proc. #{student.procNumber}</span>
                              <span>•</span>
                              <span className="font-semibold text-slate-600">
                                {student.biNumber || student.citizenCard || 'BI Pendente'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Conteúdo dinâmico: Matrícula (colunas da tabela Matricula) ou Cadastro (aba activa) */}
                      {isMatriculaMode ? (
                        <>
                          <td className="py-3 px-3 border-r border-slate-200">
                            {ultimaMatricula ? (
                              <>
                                <div className="font-mono font-bold text-slate-800">{ultimaMatricula.numeroMatricula}</div>
                                <div className="text-[11px] text-slate-500 font-medium">{ultimaMatricula.academicYear}</div>
                              </>
                            ) : (
                              <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-800 font-bold text-[10px] uppercase border border-amber-300">
                                Sem Matrícula
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <div className="font-semibold text-slate-800">
                              {ultimaMatricula ? `${ultimaMatricula.grade} — ${ultimaMatricula.className}` : '—'}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              {ultimaMatricula
                                ? `${ultimaMatricula.courseName ? ultimaMatricula.courseName + ' · ' : ''}${ultimaMatricula.shift}${ultimaMatricula.classroomRoom ? ' · Sala ' + ultimaMatricula.classroomRoom : ''}`
                                : ''}
                            </div>
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase border bg-slate-100 text-slate-700 border-slate-300 mr-1">
                              {ultimaMatricula?.tipo || '—'}
                            </span>
                            <span
                              className={`inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase border ${
                                ultimaMatricula?.estado === 'matriculado' || ultimaMatricula?.estado === 'confirmada'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : ultimaMatricula?.estado === 'cancelada' || ultimaMatricula?.estado === 'transferida'
                                  ? 'bg-red-50 text-[#7a0c0c] border-red-300'
                                  : 'bg-blue-50 text-blue-800 border-blue-300'
                              }`}
                            >
                              {ultimaMatricula?.estado || 'Pendente'}
                            </span>
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <div className="font-semibold text-slate-800 capitalize">{ultimaMatricula?.tipoAluno || '—'}</div>
                            {ultimaMatricula && (
                              <span
                                className={`inline-block mt-0.5 px-2 py-0.5 text-[10px] font-bold uppercase border ${
                                  ultimaMatricula.estadoFinanceiro === 'regular'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : ultimaMatricula.estadoFinanceiro === 'debito'
                                    ? 'bg-red-50 text-[#7a0c0c] border-red-300'
                                    : 'bg-slate-100 text-slate-700 border-slate-300'
                                }`}
                              >
                                {ultimaMatricula.estadoFinanceiro === 'regular'
                                  ? 'Regular'
                                  : ultimaMatricula.estadoFinanceiro === 'debito'
                                  ? 'Em Débito'
                                  : 'Isento'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <div className="font-mono font-bold text-[#0b1f3a]">
                              {ultimaMatricula ? `${ultimaMatricula.valorPropinaKz.toLocaleString('pt-AO')} Kz/mês` : '—'}
                            </div>
                            {!!ultimaMatricula?.descontoPercent && (
                              <div className="text-[11px] text-slate-500 font-mono">
                                Desconto: {ultimaMatricula.descontoPercent}%
                              </div>
                            )}
                          </td>
                        </>
                      ) : (
                      <>
                      {tableTab === 'geral' && (
                        <>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <div className="font-mono font-semibold text-slate-800">
                              {student.biNumber || student.citizenCard || 'Pendente'}
                            </div>
                            <span className="inline-block mt-0.5 text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 border border-slate-300">
                              {genderLabel}
                            </span>
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <div className="font-semibold text-slate-800">{student.birthDate || 'Não informado'}</div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              Nat: {student.naturalidade || student.birthPlace || 'Não informado'}
                            </div>
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <div className="font-mono font-bold text-[#0b1f3a]">
                              {student.studentPhone || 'Não informado'}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[160px]" title={student.email}>
                              {student.email || 'Sem e-mail'}
                            </div>
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <div className="font-semibold text-slate-800">{student.guardianName || 'Não registado'}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <span className="font-bold text-[#0b1f3a]">({student.guardianRelation || 'Encarregado'})</span>
                              <span className="font-mono">{student.guardianPhone}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase border bg-slate-100 text-slate-700 border-slate-300">
                              {resolveStudentSituation(student, db.matriculas)}
                            </span>
                          </td>
                        </>
                      )}

                      {tableTab === 'biografico' && (
                        <>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <span className="inline-block text-[10px] uppercase font-bold text-slate-700 bg-slate-100 px-1.5 py-0.2 border border-slate-300 mr-1.5">
                              {genderLabel}
                            </span>
                            <div className="font-mono font-bold text-slate-800 mt-1">
                              {student.biNumber || student.citizenCard || 'Sem registo'}
                            </div>
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <div className="font-semibold text-slate-800">{student.nationality || 'Angolana'}</div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              Nat: {student.birthPlace || 'Luanda'}
                            </div>
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200 max-w-xs">
                            <div className="text-slate-800 font-medium truncate" title={student.address}>
                              {student.address || 'Luanda, Angola'}
                            </div>
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <div className="font-mono font-bold text-[#0b1f3a]">
                              {student.studentPhone || 'Não informado'}
                            </div>
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <div className="font-bold text-slate-800">{student.guardianName || 'Não registado'}</div>
                            <div className="text-[11px] text-slate-600 font-medium">
                              Parentesco: <strong className="text-[#0b1f3a]">{student.guardianRelation || 'Encarregado'}</strong>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">{student.guardianPhone}</div>
                          </td>
                        </>
                      )}

                      {tableTab === 'historico_docs' && (
                        <>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <div className="font-bold text-slate-800">
                              {student.previousSchool || 'Colégio São Francisco de Assis'}
                            </div>
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <div className="font-semibold text-slate-800">
                              {student.lastCompletedGrade || '9.ª Classe'}
                            </div>
                            <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.2 border bg-blue-50 text-blue-800 border-blue-200 uppercase">
                              {student.academicSituation || 'Transitado'}
                            </span>
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <span
                              className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase border ${
                                docBi === 'Entregue'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-amber-50 text-amber-800 border-amber-300'
                              }`}
                            >
                              {docBi}
                            </span>
                          </td>
                          <td className="py-3 px-3 border-r border-slate-200">
                            <span
                              className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase border ${
                                docCert === 'Entregue'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : docCert === 'Declaração Provisória'
                                  ? 'bg-blue-50 text-blue-800 border-blue-300'
                                  : 'bg-amber-50 text-amber-800 border-amber-300'
                              }`}
                            >
                              {docCert}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center border-r border-slate-200">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 border border-emerald-300">
                              <span className="material-symbols-outlined text-[13px]">check_circle</span>
                              Passe OK
                            </span>
                          </td>
                        </>
                      )}
                      </>
                      )}

                      {/* Ações */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => acl.guard('alunos.print_docs', () => setViewingStudent(student))}
                            {...acl.buttonProps('alunos.print_docs')}
                            className="p-1.5 text-slate-700 hover:text-white hover:bg-[#0b1f3a] transition-colors cursor-pointer border border-transparent hover:border-[#0b1f3a] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-700"
                            title={acl.can('alunos.print_docs') ? 'Consultar Ficha Individual Completa' : acl.denyMessage('alunos.print_docs')}
                          >
                            <span className="material-symbols-outlined text-[18px]">badge</span>
                          </button>

                          <button
                            onClick={() => acl.guard('alunos.print_docs', () => onOpenReportCard(student))}
                            {...acl.buttonProps('alunos.print_docs')}
                            className="p-1.5 text-slate-700 hover:text-white hover:bg-[#0b1f3a] transition-colors cursor-pointer border border-transparent hover:border-[#0b1f3a] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-700"
                            title={acl.can('alunos.print_docs') ? 'Emitir Boletim Oficial de Notas' : acl.denyMessage('alunos.print_docs')}
                          >
                            <span className="material-symbols-outlined text-[18px]">assignment</span>
                          </button>

                          {!isMatriculaMode && (
                            <button
                              onClick={() => acl.guard('alunos.print_docs', () => setHistoryStudent(student))}
                              {...acl.buttonProps('alunos.print_docs')}
                              className="p-1.5 text-slate-700 hover:text-white hover:bg-[#0b1f3a] transition-colors cursor-pointer border border-transparent hover:border-[#0b1f3a] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-700"
                              title={acl.can('alunos.print_docs') ? 'Ver Histórico Escolar (matrículas nesta instituição)' : acl.denyMessage('alunos.print_docs')}
                            >
                              <span className="material-symbols-outlined text-[18px]">history</span>
                            </button>
                          )}

                          {(acl.can('alunos.edit') || acl.can('alunos.delete')) && (
                            <>
                              {isMatriculaMode && ultimaMatricula && (
                                <button
                                  onClick={() => acl.guard('alunos.edit', () => setEditingMatricula({ student, matricula: ultimaMatricula }))}
                                  {...acl.buttonProps('alunos.edit')}
                                  className="p-1.5 text-slate-700 hover:text-white hover:bg-blue-700 transition-colors cursor-pointer border border-transparent hover:border-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={acl.can('alunos.edit') ? `Editar matrícula ${ultimaMatricula.numeroMatricula}` : acl.denyMessage('alunos.edit')}
                                  aria-label="Editar matrícula"
                                >
                                  <span className="material-symbols-outlined text-[18px]">edit_note</span>
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  acl.guard('alunos.edit', () =>
                                    isMatriculaMode ? setMatriculaStudent(student) : handleOpenEdit(student)
                                  )
                                }
                                {...acl.buttonProps('alunos.edit')}
                                className={
                                  isMatriculaMode
                                    ? 'p-1.5 text-white bg-[#0b1f3a] hover:bg-[#7a0c0c] transition-colors cursor-pointer border border-[#0b1f3a]'
                                    : 'p-1.5 text-slate-700 hover:text-white hover:bg-blue-700 transition-colors cursor-pointer border border-transparent hover:border-blue-700'
                                }
                                title={isMatriculaMode ? 'Matricular (definir turma e plano financeiro)' : 'Editar dados do cadastro'}
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  {isMatriculaMode ? 'assignment_turned_in' : 'edit'}
                                </span>
                              </button>
                              <button
                                onClick={() => acl.guard('alunos.delete', () => setStudentToDelete(student))}
                                {...acl.buttonProps('alunos.delete')}
                                className="p-1.5 text-slate-500 hover:text-white hover:bg-[#ac332b] transition-colors cursor-pointer border border-transparent hover:border-[#ac332b]"
                                title="Eliminar aluno da base de dados"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: REGISTO / EDIÇÃO DE ALUNO COM TODOS OS CAMPOS SOLICITADOS */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-none max-w-3xl w-full shadow-2xl border border-slate-400 overflow-hidden flex flex-col max-h-[94vh]">
            {/* Header do Modal */}
            <div className="px-6 py-4 bg-[#0b1f3a] text-white flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px]">person_add</span>
                <h3 className="font-bold text-base tracking-wide uppercase">
                  {editingStudent ? 'Editar Cadastro' : 'Novo Cadastro'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Formulário com cantos retos e campos agrupados */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 text-xs bg-white">
              {/* 1. IDENTIFICAÇÃO PESSOAL */}
              <div className="border border-slate-300 p-4 bg-slate-50/50">
                <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-200">
                  <span className="material-symbols-outlined text-[18px] text-[#0b1f3a]">badge</span>
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    1. Identificação Pessoal
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block uppercase font-bold text-slate-700 mb-1">
                      Nome Completo do Estudante *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Manuel António da Costa"
                      className="w-full h-9 px-3 rounded-none bg-white border border-slate-300 text-slate-800 focus:border-[#0b1f3a] focus:ring-1 focus:ring-[#0b1f3a] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block uppercase font-bold text-slate-700 mb-1">
                      N.º de Processo {editingStudent ? '*' : ''}
                    </label>
                    <input
                      type="text"
                      required={!!editingStudent}
                      readOnly={!editingStudent}
                      placeholder={!editingStudent ? 'Gerado automaticamente ao gravar (Ano Lectivo + aleatório)' : undefined}
                      value={formData.procNumber}
                      onChange={(e) => setFormData({ ...formData, procNumber: e.target.value })}
                      className={`w-full h-9 px-3 rounded-none border border-slate-300 font-mono font-bold text-slate-800 focus:border-[#0b1f3a] focus:ring-1 focus:ring-[#0b1f3a] focus:outline-none ${
                        !editingStudent ? 'bg-slate-100 text-slate-400 italic cursor-not-allowed' : 'bg-white'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block uppercase font-bold text-slate-700 mb-1">
                      Género *
                    </label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full h-9 px-3 rounded-none bg-white border border-slate-300 text-slate-800 font-semibold focus:border-[#0b1f3a] focus:ring-1 focus:ring-[#0b1f3a] focus:outline-none"
                    >
                      <option value="Masculino">Masculino</option>
                      <option value="Feminino">Feminino</option>
                    </select>
                  </div>

                  <div>
                    <label className="block uppercase font-bold text-slate-700 mb-1">
                      N.º do B.I / Passaporte / Outro documento (opcional)
                    </label>
                    <input
                      type="text"
                      value={formData.biNumber}
                      onChange={(e) => setFormData({ ...formData, biNumber: e.target.value })}
                      placeholder="Ex: 004819201LA042"
                      className="w-full h-9 px-3 rounded-none bg-white border border-slate-300 font-mono font-semibold text-slate-800 focus:border-[#0b1f3a] focus:ring-1 focus:ring-[#0b1f3a] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block uppercase font-bold text-slate-700 mb-1">
                      Data de Nascimento
                    </label>
                    <input
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                      className="w-full h-9 px-3 rounded-none bg-white border border-slate-300 text-slate-800 focus:border-[#0b1f3a] focus:ring-1 focus:ring-[#0b1f3a] focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block uppercase font-bold text-slate-700 mb-1">
                      Nacionalidade *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.nationality}
                      onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                      placeholder="Ex: Angolana"
                      className="w-full h-9 px-3 rounded-none bg-white border border-slate-300 text-slate-800 focus:border-[#0b1f3a] focus:ring-1 focus:ring-[#0b1f3a] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block uppercase font-bold text-slate-700 mb-1">
                      Naturalidade *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.birthPlace}
                      onChange={(e) => setFormData({ ...formData, birthPlace: e.target.value })}
                      placeholder="Ex: Luanda, Benguela, Huambo..."
                      className="w-full h-9 px-3 rounded-none bg-white border border-slate-300 text-slate-800 focus:border-[#0b1f3a] focus:ring-1 focus:ring-[#0b1f3a] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block uppercase font-bold text-slate-700 mb-1">
                      Telefone *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.studentPhone}
                      onChange={(e) => setFormData({ ...formData, studentPhone: e.target.value })}
                      placeholder="+244 923 000 000"
                      className="w-full h-9 px-3 rounded-none bg-white border border-slate-300 font-mono font-bold text-slate-800 focus:border-[#0b1f3a] focus:ring-1 focus:ring-[#0b1f3a] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block uppercase font-bold text-slate-700 mb-1">
                      Endereço / Bairro *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Ex: Bairro Morro Bento, Rua Direita, nº 14, Luanda"
                      className="w-full h-9 px-3 rounded-none bg-white border border-slate-300 text-slate-800 focus:border-[#0b1f3a] focus:ring-1 focus:ring-[#0b1f3a] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block uppercase font-bold text-slate-700 mb-1">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="aluno@bandmed.edu.pt"
                      className="w-full h-9 px-3 rounded-none bg-white border border-slate-300 text-slate-800 focus:border-[#0b1f3a] focus:ring-1 focus:ring-[#0b1f3a] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECÇÕES 1B, 2, 3 e 4 DA FICHA DO ALUNO (Filiação, Contactos e
                  Residência, Proveniência Escolar detalhada e Situação/NEE) —
                  ficam sempre no Cadastro, nunca na Matrícula. */}
              <StudentFichaSections
                db={db}
                data={fichaExtra}
                onChange={(patch) => setFichaExtra((prev) => ({ ...prev, ...patch }))}
                canViewSensitive={acl.can('alunos.sensitive')}
              />

              {/* 5. DOCUMENTOS */}
              <div className="border border-slate-300 p-4 bg-slate-50/50">
                <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-200">
                  <span className="material-symbols-outlined text-[18px] text-[#0b1f3a]">folder_open</span>
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    5. Documentos
                  </h4>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* B.I. / Cédula / Passaporte */}
                    <div className="p-3 bg-white border border-slate-300 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block uppercase font-bold text-slate-700 text-[11px]">
                          Cópia do B.I. / Cédula / Passaporte / Outro documento
                        </label>
                        <span className="text-[10px] text-slate-500 font-mono">PDF / Imagem (Máx 5MB)</span>
                      </div>
                      <select
                        value={formData.docBiCopy}
                        onChange={(e) => setFormData({ ...formData, docBiCopy: e.target.value })}
                        className="w-full h-9 px-3 rounded-none bg-white border border-slate-300 text-slate-800 font-semibold focus:border-[#0b1f3a] focus:ring-1 focus:ring-[#0b1f3a] focus:outline-none"
                      >
                        <option value="Entregue">Entregue (Conforme)</option>
                        <option value="Pendente">Pendente de Entrega</option>
                        <option value="Dispensado">Dispensado</option>
                      </select>

                      <input
                        type="file"
                        ref={biFileInputRef}
                        accept="application/pdf,image/*"
                        onChange={handleBiFileUpload}
                        className="hidden"
                      />

                      {formData.docBiFile ? (
                        <div className="p-2 bg-emerald-50 border border-emerald-300 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="material-symbols-outlined text-[18px] text-emerald-700 shrink-0">
                              {formData.docBiFile.type.includes('pdf') ? 'picture_as_pdf' : 'image'}
                            </span>
                            <div className="truncate">
                              <p className="font-bold text-slate-800 truncate text-[11px]">{formData.docBiFile.name}</p>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {formatFileSize(formData.docBiFile.size)} • {formData.docBiFile.uploadDate}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemoveBiFile}
                            className="text-red-600 hover:text-red-800 p-1 cursor-pointer shrink-0"
                            title="Remover ficheiro anexado"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => biFileInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0b1f3a] text-white hover:bg-[#7a0c0c] font-bold text-xs cursor-pointer border border-[#0b1f3a] transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">upload</span>
                          <span>Carregar Ficheiro do B.I. / Passaporte</span>
                        </button>
                      )}
                    </div>

                    {/* Certificado Escolar */}
                    <div className="p-3 bg-white border border-slate-300 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block uppercase font-bold text-slate-700 text-[11px]">
                          Certificado / Declaração *
                        </label>
                        <span className="text-[10px] text-slate-500 font-mono">PDF / Imagem (Máx 5MB)</span>
                      </div>
                      <select
                        value={formData.docCertificate}
                        onChange={(e) => setFormData({ ...formData, docCertificate: e.target.value })}
                        className="w-full h-9 px-3 rounded-none bg-white border border-slate-300 text-slate-800 font-semibold focus:border-[#0b1f3a] focus:ring-1 focus:ring-[#0b1f3a] focus:outline-none"
                      >
                        <option value="Entregue">Entregue (Original/Autenticado)</option>
                        <option value="Declaração Provisória">Declaração com Notas</option>
                        <option value="Pendente">Pendente de Entrega</option>
                      </select>

                      <input
                        type="file"
                        ref={certFileInputRef}
                        accept="application/pdf,image/*"
                        onChange={handleCertFileUpload}
                        className="hidden"
                      />

                      {formData.docCertificateFile ? (
                        <div className="p-2 bg-emerald-50 border border-emerald-300 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="material-symbols-outlined text-[18px] text-emerald-700 shrink-0">
                              {formData.docCertificateFile.type.includes('pdf') ? 'picture_as_pdf' : 'image'}
                            </span>
                            <div className="truncate">
                              <p className="font-bold text-slate-800 truncate text-[11px]">{formData.docCertificateFile.name}</p>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {formatFileSize(formData.docCertificateFile.size)} • {formData.docCertificateFile.uploadDate}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemoveCertFile}
                            className="text-red-600 hover:text-red-800 p-1 cursor-pointer shrink-0"
                            title="Remover ficheiro anexado"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => certFileInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0b1f3a] text-white hover:bg-[#7a0c0c] font-bold text-xs cursor-pointer border border-[#0b1f3a] transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">upload</span>
                          <span>Carregar Certificado ou Declaração</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Fotografia tipo passe (Foto de Perfil) */}
                  <div className="border border-slate-300 p-3 bg-white">
                    <label className="block uppercase font-bold text-slate-800 mb-2">
                      Fotografia Tipo Passe*
                    </label>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      {/* Visualizador da foto tipo passe retangular/quadrada */}
                      <div className="w-24 h-32 bg-slate-100 border-2 border-[#0b1f3a] flex flex-col items-center justify-center overflow-hidden shrink-0 shadow-none">
                        {formData.docPassPhoto ? (
                          <img
                            src={formData.docPassPhoto}
                            alt="Foto Tipo Passe"
                            className="w-full h-full object-cover object-center"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400 text-center px-1">Sem Foto</span>
                        )}
                      </div>

                      <div className="space-y-2 flex-1">
                        <p className="text-xs text-slate-600 leading-relaxed">
                          A fotografia tipo passe é utilizada como <strong>foto de perfil oficial</strong> do estudante no sistema, cartões de estudante, fichas biográficas e pautas.
                        </p>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/*"
                            onChange={handlePhotoFileUpload}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0b1f3a] text-white hover:bg-[#7a0c0c] font-bold text-xs cursor-pointer border border-[#0b1f3a]"
                          >
                            <span className="material-symbols-outlined text-[16px]">upload</span>
                            Carregar Foto do Computador
                          </button>

                          <span className="text-slate-500 text-xs font-medium">ou selecionar da galeria de fotos (2 fotos disponíveis):</span>

                          <div className="flex items-center gap-2 p-1 bg-slate-100 border border-slate-200">
                            {DEFAULT_SAMPLE_PHOTOS.slice(0, 2).map((pUrl, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setFormData({ ...formData, docPassPhoto: pUrl })}
                                className={`group relative w-10 h-10 border overflow-hidden cursor-pointer transition-all ${
                                  formData.docPassPhoto === pUrl ? 'border-2 border-[#7a0c0c] shadow-xs' : 'border-slate-300 hover:border-slate-400'
                                }`}
                                title={`Foto ${idx + 1} da galeria`}
                              >
                                <img src={pUrl} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                                <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-white text-center font-bold">
                                  Foto {idx + 1}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ÁREA DE ANEXAR OUTROS DOCUMENTOS (ATÉ 3 DOCUMENTOS PDF/IMAGEM DE ATÉ 5MB) */}
                  <div className="border border-slate-300 p-3.5 bg-white space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px] text-[#0b1f3a]">note_add</span>
                        <label className="block uppercase font-bold text-slate-800 text-xs">
                          Anexar Outros Documentos
                        </label>
                      </div>
                      <span className="text-[11px] font-mono text-[#0b1f3a] font-bold bg-blue-50 px-2 py-0.5 border border-blue-200">
                        {formData.additionalDocs.length} de 3 documentos anexados
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Carregue de uma só vez ou gradualmente até <strong>3 documentos</strong> adicionais em formato <strong>PDF ou Imagem</strong> (máximo de <strong>5MB</strong> por ficheiro).
                    </p>

                    <input
                      type="file"
                      ref={otherDocsInputRef}
                      multiple
                      accept="application/pdf,image/*"
                      onChange={handleAdditionalDocsUpload}
                      className="hidden"
                    />

                    {formData.additionalDocs.length < 3 && (
                      <button
                        type="button"
                        onClick={() => otherDocsInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0b1f3a] text-white hover:bg-[#7a0c0c] font-bold text-xs cursor-pointer border border-[#0b1f3a] transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">upload</span>
                        <span>Documentos Adicionais</span>
                      </button>
                    )}

                    {formData.additionalDocs.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {formData.additionalDocs.map((doc, idx) => (
                          <div
                            key={doc.id || idx}
                            className="p-2.5 bg-slate-50 border border-slate-300 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <span className="material-symbols-outlined text-[20px] text-[#0b1f3a] shrink-0">
                                {doc.type.includes('pdf') ? 'picture_as_pdf' : 'image'}
                              </span>
                              <div className="truncate">
                                <p className="font-bold text-slate-800 truncate text-xs">{doc.name}</p>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {formatFileSize(doc.size)} • Carregado a {doc.uploadDate}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveAdditionalDoc(doc.id)}
                              className="text-red-600 hover:text-red-800 p-1.5 cursor-pointer shrink-0"
                              title="Remover este documento"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Botões do Formulário com animação de carregamento circular e confirmação em verde */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-300">
                <button
                  type="button"
                  disabled={submitStatus !== 'idle'}
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-none bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer border border-slate-300 disabled:opacity-50"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={submitStatus !== 'idle'}
                  className={`px-6 py-2.5 rounded-none font-bold text-xs transition-all duration-200 text-white shadow-none cursor-pointer border flex items-center gap-2 ${
                    submitStatus === 'success'
                      ? 'bg-emerald-700 border-emerald-700 text-white'
                      : 'bg-[#0b1f3a] hover:bg-[#7a0c0c] border-[#0b1f3a] text-white disabled:opacity-80'
                  }`}
                >
                  {submitStatus === 'loading' && (
                    <>
                      <Spinner size={16} className="text-white" />
                      <span>A PROCESSAR MATRÍCULA...</span>
                    </>
                  )}
                  {submitStatus === 'success' && (
                    <>
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      <span>OPERAÇÃO FEITA COM SUCESSO!</span>
                    </>
                  )}
                  {submitStatus === 'idle' && (
                    <>
                      <span className="material-symbols-outlined text-[16px]">save</span>
                      <span>{editingStudent ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            <OperationStatusModal
              isOpen={submitStatus !== 'idle'}
              status={submitStatus === 'loading' ? 'loading' : 'success'}
              loadingMessage={editingStudent ? 'A salvar alterações do aluno...' : 'A processar cadastro do aluno...'}
              successMessage="Operação feita com sucesso!"
            />
          </div>
        </div>
      )}

      {/* MODAL: FICHA INDIVIDUAL COMPLETA DO ALUNO COM TODOS OS DADOS (A4 PADRÃO - CONFORME IMAGEM 1) */}
      {viewingStudent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-3 sm:p-4 printable-modal-overlay overflow-y-auto print:p-0 print:m-0 print:block">
          <style>{`
            @media print {
              @page {
                size: A4 portrait !important;
                margin: 8mm 8mm !important;
              }
            }
          `}</style>
          <div className="printable-document printable-portrait bg-white rounded-none max-w-4xl w-full shadow-2xl border border-slate-400 overflow-hidden flex flex-col my-4 print:my-0 print:border-none print:shadow-none print:w-full print:max-h-none">
            {/* Modal Header (Oculto na impressão) */}
            <div className="px-6 py-3 bg-[#0b1f3a] text-white flex items-center justify-between gap-3 border-b border-slate-700 no-print">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-amber-400">description</span>
                <h3 className="font-bold text-sm sm:text-base tracking-wide uppercase">
                  Ficha do Aluno
                </h3>
              </div>

              <div className="flex items-center gap-1">
               
                <button
                  type="button"
                  onClick={() => setViewingStudent(null)}
                  className="text-slate-300 hover:text-white p-1 cursor-pointer transition-colors"
                  title="Fechar"
                  aria-label="Fechar"
                >
                  <span className="material-symbols-outlined text-[22px]">close</span>
                </button>
              </div>
            </div>

            {/* Aviso de Restrição por Inadimplência (Oculto na impressão) — segue a
                política "Bloquear Emissão de Certificados & Declarações" definida em
                Configurações > Tabela Financeira > Restrições por Inadimplência. */}
            {viewingStudent.financialStatus === 'debito' &&
              !!db.settings?.financialRules?.blockCertificatesWithDebt && (
                <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-300 text-amber-900 text-xs flex items-start gap-2 no-print">
                  <span className="material-symbols-outlined text-[16px] mt-0.5">block</span>
                  <span>
                    Este aluno está <strong>Em Débito</strong>. De acordo com a política de Restrições por
                    Inadimplência, a emissão/impressão de certificados e declarações está bloqueada até à
                    regularização das propinas em atraso.
                  </span>
                </div>
              )}

            {/* Modal Body - Folha A4 com Estrutura Idêntica à Imagem 1 (Foto no canto direito) */}
            <div className="p-6 sm:p-8 space-y-3.5 text-slate-800 bg-white text-xs">
              {/* Cabeçalho Institucional Oficial A4 com Foto no Canto Superior Direito */}
              <div className="border-b-2 border-[#0b1f3a] pb-3 print-break-avoid">
                <div className="flex items-start justify-between gap-4">
                  {/* Informações Institucionais à Esquerda */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-12 h-12 bg-white border border-slate-300 p-0.5 flex items-center justify-center shrink-0">
                        <img
                          src={db.settings?.logoUrl || '/school_emblem.png'}
                          alt={db.settings?.schoolName || 'Escola'}
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div>
                        <h1 className="text-base sm:text-lg font-black tracking-wide text-[#0b1f3a] uppercase">
                          {db.settings?.schoolName}
                        </h1>
                        <p className="text-[11px] text-slate-500 font-medium">
                          {db.settings?.subTitle || `NIF: ${db.settings?.nif} • ${db.settings?.province}, Angola`}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-200">
                      <div>
                        <div className="text-[10px] font-bold text-sky-800 tracking-wider uppercase">
                          DOCUMENTO HOMOLOGADO
                        </div>
                        <h2 className="text-sm sm:text-base font-black tracking-tight text-slate-900 uppercase">
                          FICHA DE CADASTRO & MATRÍCULA
                        </h2>
                        <div className="text-[11px] text-slate-500 font-semibold">
                          Ano Lectivo {db.settings?.currentAcademicYear || getFallbackAcademicYear()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-[#0b1f3a] text-white font-bold text-[11px] uppercase tracking-wider">
                          PORTAL DO ALUNO
                        </span>
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-300 font-mono font-bold text-xs">
                          Proc. #{viewingStudent.procNumber}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Foto 3x4 Oficial no Canto Superior Direito (Conforme Imagem 1) */}
                  <div className="flex flex-col items-center justify-center p-1.5 bg-slate-50 border border-slate-400 text-center shrink-0 w-24">
                    <div className="w-20 h-24 bg-slate-200 border border-slate-400 overflow-hidden flex items-center justify-center shadow-2xs">
                      {viewingStudent.avatar || viewingStudent.docPassPhoto ? (
                        <img
                          src={viewingStudent.docPassPhoto || viewingStudent.avatar}
                          alt={viewingStudent.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xl font-bold text-slate-400">
                          {viewingStudent.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] font-bold uppercase text-slate-600 tracking-tight mt-1">
                    </span>
                  </div>
                </div>
              </div>

              {/* 1. DADOS BIOGRÁFICOS & IDENTIFICAÇÃO PESSOAL (Conforme Imagem 1) */}
              <div className="border border-slate-300 bg-white print-break-avoid">
                <div className="bg-slate-100 border-b border-slate-300 px-3 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase text-[#0b1f3a] tracking-wider">
                    <span className="material-symbols-outlined text-[16px]">person</span>
                    <span>DADOS BIOGRÁFICOS & IDENTIFICAÇÃO PESSOAL</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">SECÇÃO 01</span>
                </div>

                <div className="p-3.5 space-y-2.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <span className="block text-[11px] text-slate-500 font-semibold">Nome Completo:</span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 font-bold text-slate-900 truncate">
                        {viewingStudent.name}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-500 font-semibold">Nome Social / Como Trata:</span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 font-semibold text-slate-800 truncate">
                        {viewingStudent.socialName || '—'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <span className="block text-[11px] text-slate-500 font-semibold">Género:</span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 font-semibold text-slate-800">
                        {viewingStudent.gender || 'Não registado'}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-500 font-semibold">Data Nascimento:</span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 font-mono font-semibold text-slate-800">
                        {viewingStudent.birthDate || 'Não registada'}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-500 font-semibold">Naturalidade / Município / Província:</span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 text-slate-800 truncate">
                        {[
                          viewingStudent.naturalidade || viewingStudent.placeOfBirth || viewingStudent.birthPlace,
                          viewingStudent.birthMunicipality,
                          viewingStudent.birthProvince
                        ]
                          .filter(Boolean)
                          .join(' — ') || 'Não registado'}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-500 font-semibold">Nacionalidade / País Nascimento:</span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 text-slate-800">
                        {[viewingStudent.nationality, viewingStudent.birthCountry].filter(Boolean).join(' / ') || 'Não registado'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div className="sm:col-span-2">
                      <span className="block text-[11px] text-slate-500 font-semibold">
                        {viewingStudent.docType || 'B.I. / Passaporte'}:
                      </span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 font-mono font-bold text-[#0b1f3a]">
                        {viewingStudent.biNumber || viewingStudent.citizenCard || 'Não registado'}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-500 font-semibold">Documento Válido Até:</span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 font-mono text-slate-800">
                        {viewingStudent.docValidUntil || 'Não registado'}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-500 font-semibold">Estado Civil:</span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 text-slate-800">
                        {viewingStudent.maritalStatus || 'Não informado'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. MORADA / RESIDÊNCIA HABITUAL (Conforme Imagem 1) */}
              <div className="border border-slate-300 bg-white print-break-avoid">
                <div className="bg-slate-100 border-b border-slate-300 px-3 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase text-[#0b1f3a] tracking-wider">
                    <span className="material-symbols-outlined text-[16px]">location_on</span>
                    <span>MORADA / RESIDÊNCIA HABITUAL</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">SECÇÃO 02</span>
                </div>

                <div className="p-3.5 space-y-2 text-xs">
                  <div>
                    <span className="block text-[11px] text-slate-500 font-semibold">Rua / Nº da Casa / Ponto de Referência:</span>
                    <div className="p-1.5 bg-slate-50 border border-slate-300 text-slate-800 font-medium">
                      {[viewingStudent.residence?.street, viewingStudent.residence?.houseNumber, viewingStudent.residence?.referencePoint]
                        .filter(Boolean)
                        .join(', ') ||
                        viewingStudent.address ||
                        'Não registado'}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <span className="block text-[11px] text-slate-500 font-semibold">Bairro / Distrito Urbano:</span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 text-slate-800">
                        {[viewingStudent.residence?.neighborhood, viewingStudent.residence?.urbanDistrict].filter(Boolean).join(' / ') ||
                          'Não registado'}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-500 font-semibold">Comuna / Município:</span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 text-slate-800 font-bold">
                        {[viewingStudent.residence?.commune, viewingStudent.residence?.municipality].filter(Boolean).join(' / ') ||
                          'Não registado'}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-500 font-semibold">Província:</span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 text-slate-800 font-semibold">
                        {viewingStudent.residence?.province || 'Não registado'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. HABILITAÇÕES LITERÁRIAS & PERCURSO ESCOLAR */}
              <div className="border border-slate-300 bg-white print-break-avoid">
                <div className="bg-slate-100 border-b border-slate-300 px-3 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase text-[#0b1f3a] tracking-wider">
                    <span className="material-symbols-outlined text-[16px]">school</span>
                    <span>HABILITAÇÕES LITERÁRIAS & PERCURSO ESCOLAR</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">SECÇÃO 03</span>
                </div>

                <div className="p-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse border border-slate-300">
                      <thead className="bg-slate-100 text-slate-800 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-2 border border-slate-300">Nível / Classe (Actual)</th>
                          <th className="p-2 border border-slate-300">Escola de Proveniência (Anterior)</th>
                          <th className="p-2 border border-slate-300 text-center">Classe Concluída / Média</th>
                          <th className="p-2 border border-slate-300 text-center">Ano Lectivo Anterior</th>
                          <th className="p-2 border border-slate-300 text-center">Resultado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        <tr className="bg-white">
                          <td className="p-2 border border-slate-300 font-bold text-[#0b1f3a]">{viewingStudent.className || 'Não matriculado'}</td>
                          <td className="p-2 border border-slate-300 text-slate-800">
                            {viewingStudent.previousSchoolDetails?.school || viewingStudent.previousSchool || 'Não preenchido'}
                          </td>
                          <td className="p-2 border border-slate-300 text-center font-mono">
                            {viewingStudent.previousSchoolDetails?.completedGrade ||
                              viewingStudent.previousSchoolDetails?.lastGrade ||
                              viewingStudent.lastCompletedGrade ||
                              '—'}
                            {viewingStudent.previousSchoolDetails?.finalAverage
                              ? ` (${viewingStudent.previousSchoolDetails.finalAverage} val.)`
                              : ''}
                          </td>
                          <td className="p-2 border border-slate-300 text-center font-mono font-bold">
                            {viewingStudent.previousSchoolDetails?.academicYear || '—'}
                          </td>
                          <td className="p-2 border border-slate-300 text-center">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 font-bold uppercase text-[10px]">
                              {viewingStudent.previousSchoolDetails?.result || viewingStudent.academicSituation || 'Em curso'}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {(viewingStudent.previousSchoolDetails?.certificateNumber || viewingStudent.previousSchoolDetails?.declarationNumber) && (
                    <p className="text-[10px] text-slate-500 mt-1.5">
                      {viewingStudent.previousSchoolDetails?.certificateNumber &&
                        `Certificado nº ${viewingStudent.previousSchoolDetails.certificateNumber}. `}
                      {viewingStudent.previousSchoolDetails?.declarationNumber &&
                        `Declaração nº ${viewingStudent.previousSchoolDetails.declarationNumber}.`}
                    </p>
                  )}

                  {/* Avaliações Curriculares Registadas */}
                  {viewingStudent.grades && Object.keys(viewingStudent.grades).length > 0 && (
                    <div className="mt-3">
                      <div className="text-[11px] font-bold text-[#0b1f3a] uppercase mb-1.5 flex items-center justify-between">
                        <span>Classificações Curriculares Oficiais (0 - 20 Valores)</span>
                        <span className="font-mono text-slate-600 font-bold">
                          Média: {viewingStudent.currentAverage && viewingStudent.currentAverage > 0 ? viewingStudent.currentAverage : 'Sem notas'}
                          {viewingStudent.currentAverage && viewingStudent.currentAverage > 0 ? ' Valores' : ''}
                        </span>
                      </div>
                      <table className="w-full text-xs text-left border-collapse border border-slate-300">
                        <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
                          <tr>
                            <th className="p-1.5 border border-slate-300">Disciplina</th>
                            <th className="p-1.5 border border-slate-300 text-center">Classificação</th>
                            <th className="p-1.5 border border-slate-300 text-right">Resultado Qualitativo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 font-mono">
                          {Object.entries(viewingStudent.grades).map(([subj, grade]) => {
                            const val = Number(grade) || 0;
                            const isPass = val >= 10;
                            return (
                              <tr key={subj} className="hover:bg-slate-50">
                                <td className="p-1.5 border border-slate-300 font-sans font-semibold text-slate-800">{subj}</td>
                                <td className="p-1.5 border border-slate-300 text-center font-bold">
                                  <span className={`px-2 py-0.5 border text-xs ${isPass ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
                                    {val.toFixed(1)}
                                  </span>
                                </td>
                                <td className="p-1.5 border border-slate-300 text-right font-sans font-medium text-slate-700">
                                  {val >= 16 ? 'Excelente' : val >= 14 ? 'Bom' : val >= 10 ? 'Suficiente' : 'Não Apto'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. DADOS DE MATRÍCULA & ENQUADRAMENTO ESCOLAR */}
              <div className="border border-slate-300 bg-white print-break-avoid">
                <div className="bg-slate-100 border-b border-slate-300 px-3 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase text-[#0b1f3a] tracking-wider">
                    <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
                    <span>DADOS DE MATRÍCULA & ENQUADRAMENTO ESCOLAR</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">SECÇÃO 04</span>
                </div>

                <div className="p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div>
                    <span className="block text-[11px] text-slate-500 font-semibold">Estado da Matrícula:</span>
                    {(() => {
                      const historico = dbService.getMatriculasByStudent(viewingStudent.id);
                      const ultima = historico[0];
                      if (!ultima) {
                        return (
                          <div className="p-1.5 bg-slate-100 border border-slate-300 text-slate-500 font-bold uppercase">
                            Sem Matrícula
                          </div>
                        );
                      }
                      const style =
                        ultima.estado === 'confirmada' || ultima.estado === 'matriculado'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : ultima.estado === 'pendente'
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : ultima.estado === 'cancelada'
                          ? 'bg-slate-100 border-slate-300 text-slate-500'
                          : 'bg-blue-50 border-blue-300 text-blue-900';
                      return (
                        <div className={`p-1.5 border font-bold uppercase ${style}`}>
                          {ultima.estado} · {ultima.academicYear}
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500 font-semibold">Regime de Propinas:</span>
                    <div className={`p-1.5 border font-bold uppercase ${
                      viewingStudent.financialStatus === 'regular'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : viewingStudent.financialStatus === 'debito'
                        ? 'bg-red-50 text-red-800 border-red-300'
                        : 'bg-slate-100 text-slate-700 border-slate-300'
                    }`}>
                      {viewingStudent.financialStatus === 'regular' ? 'Regular (Em Dia)' : viewingStudent.financialStatus === 'debito' ? 'Em Débito' : 'Isento / Bolsa'}
                    </div>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500 font-semibold">Valor da Mensalidade:</span>
                    <div className="p-1.5 bg-slate-50 border border-slate-300 font-mono font-bold text-slate-900">
                      {viewingStudent.monthlyTuitionKz ? `${viewingStudent.monthlyTuitionKz.toLocaleString()} Kz/mês` : 'Não definida'}
                    </div>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500 font-semibold">Taxa de Assiduidade:</span>
                    <div className="p-1.5 bg-slate-50 border border-slate-300 font-mono font-bold text-emerald-700">
                      {typeof viewingStudent.attendanceRate === 'number' ? `${viewingStudent.attendanceRate}%` : 'Sem dados'} ({viewingStudent.unexcusedAbsences || 0} faltas)
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. CONTACTOS & ENCARREGADOS DE EDUCAÇÃO */}
              <div className="border border-slate-300 bg-white print-break-avoid">
                <div className="bg-slate-100 border-b border-slate-300 px-3 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase text-[#0b1f3a] tracking-wider">
                    <span className="material-symbols-outlined text-[16px]">call</span>
                    <span>CONTACTOS & ENCARREGADOS DE EDUCAÇÃO</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">SECÇÃO 05</span>
                </div>

                <div className="p-3.5 space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="block text-[11px] text-slate-500 font-semibold">Email do Estudante:</span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 font-mono text-slate-800">
                        {viewingStudent.email || `${viewingStudent.procNumber}@bandmed.co.ao`}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-500 font-semibold">Telemóvel do Estudante:</span>
                      <div className="p-1.5 bg-slate-50 border border-slate-300 font-mono font-bold text-[#0b1f3a]">
                        {viewingStudent.studentPhone || 'Não informado'}
                      </div>
                    </div>
                  </div>

                  {/* Sub-caixa "Em caso de urgência contactar" (igual à imagem de exemplo) */}
                  <div className="border border-slate-300 p-2.5 bg-slate-50">
                    <span className="block text-[11px] text-[#0b1f3a] font-bold uppercase mb-2">
                      Em caso de urgência contactar (Encarregado de Educação):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <div className="sm:col-span-2">
                        <span className="block text-[10px] text-slate-500 font-semibold">Nome do Encarregado:</span>
                        <div className="p-1 bg-white border border-slate-300 font-bold text-slate-900 truncate">
                          {viewingStudent.guardianName || 'Não registado'}
                        </div>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 font-semibold">Parentesco:</span>
                        <div className="p-1 bg-white border border-slate-300 font-bold text-[#7a0c0c] uppercase">
                          {viewingStudent.guardianRelation || 'Pai'}
                        </div>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 font-semibold">Telefone:</span>
                        <div className="p-1 bg-white border border-slate-300 font-mono font-bold text-[#0b1f3a]">
                          {viewingStudent.guardianPhone || 'Sem contacto'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <span className="block text-[10px] text-slate-500 font-semibold">Email do Encarregado:</span>
                      <div className="p-1 bg-white border border-slate-300 font-mono text-slate-700">
                        {viewingStudent.guardianEmail || 'Não informado'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 6. FILIAÇÃO — PAI, MÃE & RESPONSÁVEL FINANCEIRO */}
              {(() => {
                const canViewSensitive = acl.can('alunos.sensitive');
                const fil = viewingStudent.filiation;
                const hasFinResp = fil?.financialResponsibleIsDifferent && fil?.financialResponsible?.name;
                return (
                  <div className="border border-slate-300 bg-white print-break-avoid">
                    <div className="bg-slate-100 border-b border-slate-300 px-3 py-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs uppercase text-[#0b1f3a] tracking-wider">
                        <span className="material-symbols-outlined text-[16px]">diversity_3</span>
                        <span>FILIAÇÃO — PAI, MÃE & RESPONSÁVEL FINANCEIRO</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">SECÇÃO 06</span>
                    </div>
                    <div className="p-3.5 space-y-2.5 text-xs">
                      {hasFinResp && (
                        <div>
                          <span className="block text-[11px] text-slate-500 font-semibold">
                            Responsável Financeiro (diferente do Encarregado):
                          </span>
                          <div className="p-1.5 bg-slate-50 border border-slate-300 text-slate-800 font-medium">
                            {fil!.financialResponsible!.name}
                            {fil!.financialResponsible!.phone ? ` · ${fil!.financialResponsible!.phone}` : ''}
                          </div>
                        </div>
                      )}
                      {!canViewSensitive ? (
                        <div className="flex items-center gap-2 p-3 text-slate-500 bg-slate-50 border border-slate-200">
                          <span className="material-symbols-outlined text-[16px]">lock</span>
                          Dados de Pai/Mãe com acesso restrito (regra <code>alunos.sensitive</code>).
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <span className="block text-[11px] text-slate-500 font-semibold">Pai:</span>
                            <div className="p-1.5 bg-slate-50 border border-slate-300 text-slate-800">
                              {fil?.father?.name || 'Não registado'}
                              {fil?.father?.phone ? ` · ${fil.father.phone}` : ''}
                            </div>
                          </div>
                          <div>
                            <span className="block text-[11px] text-slate-500 font-semibold">Mãe:</span>
                            <div className="p-1.5 bg-slate-50 border border-slate-300 text-slate-800">
                              {fil?.mother?.name || 'Não registada'}
                              {fil?.mother?.phone ? ` · ${fil.mother.phone}` : ''}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 7. SITUAÇÃO DO ALUNO & NECESSIDADES EDUCATIVAS ESPECIAIS */}
              <div className="border border-slate-300 bg-white print-break-avoid">
                <div className="bg-slate-100 border-b border-slate-300 px-3 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase text-[#0b1f3a] tracking-wider">
                    <span className="material-symbols-outlined text-[16px]">fact_check</span>
                    <span>SITUAÇÃO DO ALUNO & NECESSIDADES ESPECIAIS</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">SECÇÃO 07</span>
                </div>
                <div className="p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <span className="block text-[11px] text-slate-500 font-semibold">Situação do Aluno:</span>
                    <div className="p-1.5 bg-slate-50 border border-slate-300 font-bold text-slate-800">
                      {resolveStudentSituation(viewingStudent, db.matriculas)}
                    </div>
                  </div>
                  {acl.can('alunos.sensitive') ? (
                    <>
                      <div>
                        <span className="block text-[11px] text-slate-500 font-semibold">Necessidade Educativa Especial:</span>
                        <div className="p-1.5 bg-slate-50 border border-slate-300 text-slate-800">
                          {viewingStudent.specialNeeds?.hasNeeds
                            ? viewingStudent.specialNeeds?.type || 'Sim (tipo não especificado)'
                            : 'Não'}
                        </div>
                      </div>
                      <div>
                        <span className="block text-[11px] text-slate-500 font-semibold">Necessita de Apoio Especial:</span>
                        <div className="p-1.5 bg-slate-50 border border-slate-300 text-slate-800">
                          {viewingStudent.specialNeeds?.needsSupport ? 'Sim' : 'Não'}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-2 flex items-center gap-2 p-3 text-slate-500 bg-slate-50 border border-slate-200">
                      <span className="material-symbols-outlined text-[16px]">lock</span>
                      NEE com acesso restrito (regra <code>alunos.sensitive</code>).
                    </div>
                  )}
                </div>
              </div>

              {/* 8. DOCUMENTOS ARQUIVADOS NO PROCESSO FÍSICO */}
              <div className="border border-slate-300 bg-white print-break-avoid">
                <div className="bg-slate-100 border-b border-slate-300 px-3 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase text-[#0b1f3a] tracking-wider">
                    <span className="material-symbols-outlined text-[16px]">folder_open</span>
                    <span>DOCUMENTOS ARQUIVADOS NO PROCESSO FÍSICO</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">SECÇÃO 06</span>
                </div>

                <div className="p-2">
                  <table className="w-full text-xs text-left border-collapse border border-slate-300">
                    <thead className="bg-slate-100 text-slate-800 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-2 border border-slate-300">Tipo Doc.</th>
                        <th className="p-2 border border-slate-300">Descrição / Ficheiro</th>
                        <th className="p-2 border border-slate-300 text-center">Estado de Arquivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr className="bg-white">
                        <td className="p-2 border border-slate-300 font-bold text-slate-900">Bilhete de Identidade / Passaporte</td>
                        <td className="p-2 border border-slate-300 text-slate-700">
                          Cópia autêntica arquivada {viewingStudent.docBiFile ? `(${viewingStudent.docBiFile.name})` : ''}
                        </td>
                        <td className="p-2 border border-slate-300 text-center">
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold uppercase text-[10px]">
                            {viewingStudent.docBiCopy || 'Entregue'}
                          </span>
                        </td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="p-2 border border-slate-300 font-bold text-slate-900">Certificado de Habilitações</td>
                        <td className="p-2 border border-slate-300 text-slate-700">
                          Certificado de estudos anteriores {viewingStudent.docCertificateFile ? `(${viewingStudent.docCertificateFile.name})` : ''}
                        </td>
                        <td className="p-2 border border-slate-300 text-center">
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold uppercase text-[10px]">
                            {viewingStudent.docCertificate || 'Entregue'}
                          </span>
                        </td>
                      </tr>
                      <tr className="bg-white">
                        <td className="p-2 border border-slate-300 font-bold text-slate-900">Fotografia Tipo Passe (3x4)</td>
                        <td className="p-2 border border-slate-300 text-slate-700">Fotografia atualizada no sistema</td>
                        <td className="p-2 border border-slate-300 text-center">
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold uppercase text-[10px]">
                            Entregue
                          </span>
                        </td>
                      </tr>
                      {viewingStudent.additionalDocs && viewingStudent.additionalDocs.map((doc, idx) => (
                        <tr key={doc.id || idx} className="bg-slate-50/50">
                          <td className="p-2 border border-slate-300 font-bold text-slate-900">Documento Complementar</td>
                          <td className="p-2 border border-slate-300 text-slate-700">{doc.name}</td>
                          <td className="p-2 border border-slate-300 text-center">
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold uppercase text-[10px]">
                              Arquivado
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 7. TERMO DE AUTENTICAÇÃO E ASSINATURAS OFICIAIS */}
              <div className="pt-3 border-t-2 border-[#0b1f3a] print-break-avoid">
                <p className="text-[11px] text-slate-600 italic text-center mb-4">
                  Declaro sob compromisso de honra a veracidade e autenticidade de todas as informações constantes nesta ficha cadastral oficial.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-end text-center text-xs">
                  <div>
                    <div className="h-8 border-b border-dashed border-slate-500 mx-4 mb-1" />
                    <span className="font-bold text-slate-900 uppercase block text-[11px]">
                      O(A) Encarregado(a) / Aluno(a)
                    </span>
                    <span className="text-[10px] text-slate-500"></span>
                  </div>

                  <div>
                    <div className="h-8 border-b border-dashed border-slate-500 mx-4 mb-1" />
                    <span className="font-bold text-[#0b1f3a] uppercase block text-[11px]">
                      A Secretaria
                    </span>
                    <span className="text-[10px] text-slate-500">{db.settings?.schoolName}</span>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between text-[9px] text-slate-500">
                  <span>Emissão: {new Date().toLocaleDateString('pt-PT')} • Sistema Integrado BandMed</span>
                  <span></span>
                </div>
              </div>
            </div>

            {/* Modal Actions (Oculto na impressão) */}
            <div className="px-6 py-4 bg-slate-100 border-t border-slate-300 flex items-center justify-end gap-3 no-print">
              <button
                type="button"
                onClick={() => {
                  const blocked =
                    viewingStudent.financialStatus === 'debito' &&
                    !!db.settings?.financialRules?.blockCertificatesWithDebt;
                  if (blocked) {
                    alert(
                      'Emissão bloqueada: este aluno está em débito e a política de Restrições por Inadimplência (Configurações > Tabela Financeira) impede a emissão de certificados/declarações até à regularização.'
                    );
                    return;
                  }
                  window.focus();
                  window.print();
                }}
                disabled={
                  viewingStudent.financialStatus === 'debito' &&
                  !!db.settings?.financialRules?.blockCertificatesWithDebt
                }
                className="flex items-center gap-1.5 px-4 py-2 bg-[#7a0c0c] hover:bg-[#5e0909] text-white font-bold text-xs border border-[#7a0c0c] cursor-pointer transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                title="Abrir área de impressão do dispositivo para folha A4"
              >
                <span className="material-symbols-outlined text-[16px]">print</span>
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={() => setViewingStudent(null)}
                className="px-5 py-2 bg-slate-300 hover:bg-slate-400 text-slate-900 font-bold text-xs cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO DE ELIMINAÇÃO */}
      {studentToDelete && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full shadow-2xl border border-slate-400 overflow-hidden">
            {/* Cabeçalho azul igual ao padrão institucional */}
            <div className="px-5 py-3.5 bg-[#0b1f3a] text-white flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-red-400">warning</span>
                <h3 className="font-bold text-xs tracking-wider uppercase text-white">
                  Eliminação
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                className="text-slate-300 hover:text-white p-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-6 bg-white">
              <div className="w-12 h-12 bg-red-100 text-[#ac332b] flex items-center justify-center mx-auto mb-4 border border-red-200">
                <span className="material-symbols-outlined text-[28px]">delete_forever</span>
              </div>
              <h4 className="font-headline text-base font-bold text-slate-900 text-center">
                Eliminar Aluno?
              </h4>
              <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
                Tem a certeza que deseja eliminar permanentemente a matrícula de{' '}
                <strong className="text-slate-900">{studentToDelete.name}</strong> (Processo nº{' '}
                <span className="font-mono font-bold">{studentToDelete.procNumber}</span>, Turma:{' '}
                {studentToDelete.className})? Esta operação é irreversível e removerá o aluno de todas as pautas e registos.
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer border border-slate-300 rounded-none"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const student = studentToDelete;
                  setStudentToDelete(null);
                  await runGlobalOperation(
                    async () => {
                      dbService.deleteStudent(student.id);
                    },
                    {
                      loadingMessage: `A eliminar matrícula de ${student.name}...`,
                      successMessage: 'Operação feita com sucesso!',
                      requiredRule: 'alunos.delete',
                      userRole: currentUserRole
                    }
                  );
                }}
                className="px-5 py-2.5 rounded-none bg-[#b91c1c] hover:bg-[#7a0c0c] text-white font-bold text-xs flex items-center gap-2 cursor-pointer transition-colors shadow-none border-none"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>Eliminar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MATRÍCULA (secção Matrículas — turma, plano financeiro, tipo/estado) */}
      {matriculaStudent && (
        <MatriculaModal
          db={db}
          student={matriculaStudent}
          onClose={() => setMatriculaStudent(null)}
          onSaved={() => setMatriculaStudent(null)}
        />
      )}

      {/* MODAL: EDITAR MATRÍCULA existente */}
      {editingMatricula && (
        <MatriculaModal
          db={db}
          student={editingMatricula.student}
          matricula={editingMatricula.matricula}
          onClose={() => setEditingMatricula(null)}
          onSaved={() => setEditingMatricula(null)}
        />
      )}

      {/* MODAL: HISTÓRICO ESCOLAR (matrículas do aluno DENTRO desta instituição) */}
      {historyStudent && (
        <StudentHistoryModal
          db={db}
          student={historyStudent}
          onClose={() => {
            setHistoryStudent(null);
            setYearViewMatricula(null);
          }}
          onNewMatricula={(studentId) => {
            const target = db.students.find((s) => s.id === studentId);
            setHistoryStudent(null);
            if (isMatriculaMode) {
              if (target) setMatriculaStudent(target);
            } else if (onNavigateToMatriculas) {
              onNavigateToMatriculas(studentId);
            }
          }}
          onViewYear={(matricula) => setYearViewMatricula(matricula)}
        />
      )}

      {/* MODAL: VISTA DO ALUNO NUM ANO LECTIVO ESPECÍFICO (relatórios financeiro/académico) */}
      {historyStudent && yearViewMatricula && (
        <StudentYearRecordModal
          db={db}
          student={historyStudent}
          matricula={yearViewMatricula}
          onClose={() => setYearViewMatricula(null)}
        />
      )}
    </div>
  );
};
