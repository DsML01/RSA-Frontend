import { FormEvent, useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

type User = { id: number; name: string; email: string; role: 'student' | 'teacher' }
type Feedback = { message: string; isError: boolean }
type RsaTest = { id: number; status: string; total: number; approved: number; failed: number; errored: number; score_percent: number; buckets: Record<string, { total: number; approved: number; failed: number; errored: number }>; last_error: string }
type RsaUpload = { id: number; filename: string; uploaded_at: string; latest_test?: RsaTest }
type CustomTestInput = { p: number; q: number; e: number; message: string }
type CustomTestResult = { status: 'passed' | 'failed' | 'error'; ciphertext: number[]; decrypted_message: string | null; decoder_output: string; decoder_stderr: string; error: string; public_key: { n: number; e: number } }
type StudentSummary = User & { group_id: number | null }
type StudentGroup = { id: number; name: string; created_at: string; leader: User; members: User[] }
type MyGroup = { group: StudentGroup | null; is_leader: boolean }
type GroupTest = { id: number; status: string; total: number; approved: number; failed: number; errored: number; score_percent: number; last_error: string; created_at: string; encoder_group: { id: number; name: string } | null; decoder_group: { id: number; name: string } | null; encoder_upload: string | null; decoder_upload: string | null }
const PRIME_DIGITS = [2, 3, 4, 5, 6, 7, 8, 9]

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}

function downloadCustomResult(result: CustomTestResult) {
  const content = [
    'RESULTADO DO TESTE PERSONALIZADO RSA',
    '',
    `Status: ${result.status}`,
    `Chave publica: n = ${result.public_key.n}, e = ${result.public_key.e}`,
    `Mensagem decifrada: ${result.decrypted_message ?? '(decoder nao devolveu uma mensagem valida)'}`,
    `Diagnostico: ${result.error || '(sem erros)'}`,
    '',
    'CIPHERTEXT:',
    JSON.stringify(result.ciphertext),
    '',
    'STDOUT DO DECODER:',
    result.decoder_output || '(vazio)',
    '',
    'STDERR DO DECODER:',
    result.decoder_stderr || '(vazio)',
    '',
  ].join('\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'resultado-teste-rsa.txt'
  link.click()
  URL.revokeObjectURL(url)
}

async function authenticatedJson(path: string, token: string, init: RequestInit = {}) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (init.body) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${API_URL}${path}`, { ...init, headers })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail ?? 'Não foi possível concluir a operação.')
  return data
}

function TeacherDashboard({ token }: { token: string }) {
  const [students, setStudents] = useState<StudentSummary[]>([])
  const [groups, setGroups] = useState<StudentGroup[]>([])
  const [availableLeaders, setAvailableLeaders] = useState<User[]>([])
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false)
  const [studentForPromotion, setStudentForPromotion] = useState<StudentSummary | null>(null)
  const [groupTests, setGroupTests] = useState<GroupTest[]>([])
  const [isGroupTestingModalOpen, setIsGroupTestingModalOpen] = useState(false)
  const [isStartingGroupTest, setIsStartingGroupTest] = useState(false)
  const [isCustomGroupTesting, setIsCustomGroupTesting] = useState(false)
  const [groupTestFeedback, setGroupTestFeedback] = useState<Feedback | null>(null)
  const [groupCustomResult, setGroupCustomResult] = useState<CustomTestResult | null>(null)

  async function loadData() {
    try {
      const [studentData, groupData, leaderData, groupTestData] = await Promise.all([
        authenticatedJson('/users/students', token),
        authenticatedJson('/groups', token),
        authenticatedJson('/groups/available-leaders', token),
        authenticatedJson('/group-tests', token),
      ])
      setStudents(studentData as StudentSummary[])
      setGroups(groupData as StudentGroup[])
      setAvailableLeaders(leaderData as User[])
      setGroupTests(groupTestData as GroupTest[])
    } catch (error) {
      setFeedback({ message: messageFrom(error), isError: true })
    }
  }

  useEffect(() => { void loadData() }, [token])

  useEffect(() => {
    if (!groupTests.some((test) => ['queued', 'running'].includes(test.status))) return
    const timer = window.setInterval(() => { void loadData() }, 2000)
    return () => window.clearInterval(timer)
  }, [token, groupTests])

  async function grantRole(studentId: number) {
    try {
      await authenticatedJson(`/users/${studentId}/role`, token, { method: 'PATCH', body: JSON.stringify({ role: 'teacher' }) })
      setStudentForPromotion(null)
      setIsPromotionModalOpen(false)
      setFeedback({ message: 'Papel de professor concedido.', isError: false })
      await loadData()
    } catch (error) {
      setFeedback({ message: messageFrom(error), isError: true })
    }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    try {
      await authenticatedJson('/groups', token, {
        method: 'POST',
        body: JSON.stringify({ name: values.get('name'), leader_id: Number(values.get('leader_id')) }),
      })
      form.reset()
      setFeedback({ message: 'Grupo criado com sucesso.', isError: false })
      await loadData()
    } catch (error) {
      setFeedback({ message: messageFrom(error), isError: true })
    }
  }

  async function startGroupTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setIsStartingGroupTest(true)
    setGroupTestFeedback(null)
    try {
      const test = await authenticatedJson('/group-tests', token, {
        method: 'POST',
        body: JSON.stringify({ encoder_group_id: Number(values.get('encoder_group_id')), decoder_group_id: Number(values.get('decoder_group_id')) }),
      }) as GroupTest
      setGroupTests((current) => [test, ...current])
      setGroupTestFeedback({ message: 'Bateria de 400 casos iniciada: 50 textos com primos de 2 a 9 dígitos. O resultado será atualizado automaticamente.', isError: false })
    } catch (error) {
      setGroupTestFeedback({ message: messageFrom(error), isError: true })
    } finally {
      setIsStartingGroupTest(false)
    }
  }

  async function startCustomGroupTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setIsCustomGroupTesting(true)
    setGroupTestFeedback(null)
    try {
      const result = await authenticatedJson('/group-tests/custom', token, {
        method: 'POST',
        body: JSON.stringify({
          encoder_group_id: Number(values.get('encoder_group_id')),
          decoder_group_id: Number(values.get('decoder_group_id')),
          p: Number(values.get('p')), q: Number(values.get('q')), e: Number(values.get('e')),
          message: String(values.get('message') ?? ''),
        }),
      }) as CustomTestResult
      setGroupCustomResult(result)
      setGroupTestFeedback({ message: result.status === 'passed' ? 'Teste personalizado aprovado.' : 'O teste personalizado encontrou um problema.', isError: result.status !== 'passed' })
    } catch (error) {
      setGroupCustomResult(null)
      setGroupTestFeedback({ message: messageFrom(error), isError: true })
    } finally {
      setIsCustomGroupTesting(false)
    }
  }

  return <>
    <section className="card">
      <h2>Gerenciar grupos</h2>
      <p className="hint">Todo grupo precisa nascer com um aluno líder. A lista contém somente alunos sem grupo; assim, ninguém pode liderar dois grupos.</p>
      <form className="management-form" onSubmit={createGroup}>
        <label>Nome do grupo<input name="name" required minLength={2} maxLength={100} placeholder="Ex.: Grupo RSA 1" /></label>
        <label>Líder aluno<select name="leader_id" required defaultValue=""><option value="" disabled>{availableLeaders.length ? 'Selecione um aluno' : 'Nenhum aluno disponível'}</option>{availableLeaders.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
        <button disabled={!availableLeaders.length}>Criar grupo</button>
      </form>
      {!availableLeaders.length && <p className="hint">Não há alunos sem grupo disponíveis para liderar um novo grupo.</p>}
    </section>
    <section className="card">
      <h2>Grupos criados</h2>
      {groups.length ? <ul className="activity-list">{groups.map((group) => <li key={group.id}><strong>{group.name}</strong><span>Líder: {group.leader.name}</span><small>{group.members.length} integrante(s): {group.members.map((member) => member.name).join(', ')}</small></li>)}</ul> : <p className="hint">Nenhum grupo foi criado.</p>}
    </section>
    <section className="card">
      <h2>Testar interoperabilidade entre grupos</h2>
      <p className="hint">Use o encoder da versão mais recente de um grupo e o decoder da versão mais recente de outro. A bateria executa 50 textos longos com primos de 2 a 9 dígitos: 400 casos ao todo.</p>
      <button type="button" disabled={groups.length < 2} onClick={() => { setGroupTestFeedback(null); setGroupCustomResult(null); setIsGroupTestingModalOpen(true) }}>Testar grupos</button>
      {groups.length < 2 && <p className="hint">Crie ao menos dois grupos para iniciar uma avaliação entre eles.</p>}
    </section>
    {groupTests.length > 0 && <section className="card"><h2>Últimas avaliações entre grupos</h2><ul className="activity-list">{groupTests.slice(0, 5).map((test) => <li key={test.id}><strong>{test.encoder_group?.name ?? 'Grupo removido'} → {test.decoder_group?.name ?? 'Grupo removido'}</strong><span>{['queued', 'running'].includes(test.status) ? 'Bateria em andamento…' : `${test.approved} de ${test.total} aprovados (${test.score_percent}%) · ${test.failed} falhas · ${test.errored} erros`}</span><small>Encoder: {test.encoder_upload ?? 'indisponível'} · Decoder: {test.decoder_upload ?? 'indisponível'}</small>{test.last_error && !['queued', 'running'].includes(test.status) && <small>{test.last_error}</small>}</li>)}</ul></section>}
    <section className="card">
      <h2>Conceder papel de professor</h2>
      <p className="hint">A promoção é permanente nesta etapa. Um aluno que pertence a grupo deve sair antes de ser promovido.</p>
      <button type="button" onClick={() => { setStudentForPromotion(null); setIsPromotionModalOpen(true) }}>Conceder papel de professor</button>
    </section>
    {feedback && <p className={`notice ${feedback.isError ? 'error' : ''}`} role="status">{feedback.message}</p>}
    {isGroupTestingModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsGroupTestingModalOpen(false)}><section className="modal-card wide-modal-card" role="dialog" aria-modal="true" aria-labelledby="group-test-title" onMouseDown={(event) => event.stopPropagation()}><h2 id="group-test-title">Testar grupos</h2><p className="hint">O primeiro grupo fornece <code>encoder.c</code>; o segundo fornece <code>decoder.c</code>. Em ambos os casos será usado o ZIP mais recente enviado por algum integrante. A bateria executa 50 textos com primos de 2 a 9 dígitos, totalizando 400 casos.</p>{groupTestFeedback && <p className={`notice ${groupTestFeedback.isError ? 'error' : ''}`} role="status">{groupTestFeedback.message}</p>}<form className="group-test-form" onSubmit={startGroupTest}><label>Grupo que cifra<select name="encoder_group_id" required defaultValue=""><option value="" disabled>Selecione o grupo encoder</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label>Grupo que decifra<select name="decoder_group_id" required defaultValue=""><option value="" disabled>Selecione o grupo decoder</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><button disabled={isStartingGroupTest}>{isStartingGroupTest ? 'Iniciando…' : 'Executar 400 casos'}</button></form><details className="custom-test"><summary>Executar teste personalizado entre grupos</summary><p className="hint">Escolha os grupos, dois primos de 2 a 9 dígitos, e e uma mensagem ASCII imprimível.</p><form className="custom-test-form" onSubmit={startCustomGroupTest}><label>Grupo que cifra<select name="encoder_group_id" required defaultValue=""><option value="" disabled>Selecione o grupo encoder</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label>Grupo que decifra<select name="decoder_group_id" required defaultValue=""><option value="" disabled>Selecione o grupo decoder</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label>Primo p<input name="p" type="number" min="10" max="999999999" required defaultValue="61" /></label><label>Primo q<input name="q" type="number" min="10" max="999999999" required defaultValue="53" /></label><label>Expoente e<input name="e" type="number" min="2" required defaultValue="17" /></label><label className="custom-message">Mensagem<textarea name="message" required minLength={1} maxLength={1000} defaultValue="Mensagem de teste entre grupos." /></label><button disabled={isCustomGroupTesting}>{isCustomGroupTesting ? 'Testando…' : 'Testar valores escolhidos'}</button></form></details>{groupCustomResult && <div className={`custom-result ${groupCustomResult.status}`}><strong>{groupCustomResult.status === 'passed' ? 'Aprovado' : groupCustomResult.status === 'failed' ? 'Falhou' : 'Erro de execução'}</strong><span>Chave pública: n = {groupCustomResult.public_key.n}, e = {groupCustomResult.public_key.e}</span>{groupCustomResult.ciphertext.length > 0 && <code>Ciphertext: [{groupCustomResult.ciphertext.join(', ')}]</code>}{groupCustomResult.decrypted_message !== null && <span>Mensagem decifrada: {groupCustomResult.decrypted_message}</span>}<span>Saída bruta do decoder (stdout):</span><pre>{JSON.stringify(groupCustomResult.decoder_output)}</pre><span>Saída de erro do decoder (stderr):</span><pre>{JSON.stringify(groupCustomResult.decoder_stderr)}</pre>{groupCustomResult.error && <small>{groupCustomResult.error}</small>}<button type="button" className="secondary" onClick={() => downloadCustomResult(groupCustomResult)}>Baixar resultado em .txt</button></div>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setIsGroupTestingModalOpen(false)}>Fechar</button></div></section></div>}
    {isPromotionModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => { setStudentForPromotion(null); setIsPromotionModalOpen(false) }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="promotion-title" onMouseDown={(event) => event.stopPropagation()}>{studentForPromotion ? <><h2 id="promotion-title">Confirmar promoção</h2><p>Deseja promover <strong>{studentForPromotion.name}</strong> ({studentForPromotion.email}) para professor?</p><p className="hint">A conta deixará de acessar as ações exclusivas de aluno.</p><div className="modal-actions"><button type="button" className="secondary" onClick={() => setStudentForPromotion(null)}>Voltar à lista</button><button type="button" onClick={() => grantRole(studentForPromotion.id)}>Confirmar promoção</button></div></> : <><h2 id="promotion-title">Selecionar aluno</h2><p className="hint">Escolha o aluno que receberá o papel de professor.</p>{students.length ? <ul className="activity-list modal-student-list">{students.map((student) => <li key={student.id}><strong>{student.name}</strong><span>{student.email}{student.group_id ? ' · já participa de grupo' : ''}</span><button type="button" disabled={student.group_id !== null} onClick={() => setStudentForPromotion(student)}>{student.group_id ? 'Em grupo' : 'Selecionar'}</button></li>)}</ul> : <p className="hint">Não há alunos disponíveis.</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setIsPromotionModalOpen(false)}>Fechar</button></div></>}</section></div>}
  </>
}

function StudentGroupPanel({ token }: { token: string }) {
  const [state, setState] = useState<MyGroup | null>(null)
  const [availableStudents, setAvailableStudents] = useState<User[]>([])
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)

  async function loadGroup() {
    try {
      const groupState = await authenticatedJson('/my-group', token) as MyGroup
      setState(groupState)
      if (groupState.group && groupState.is_leader) {
        const available = await authenticatedJson(`/groups/${groupState.group.id}/available-students`, token)
        setAvailableStudents(available as User[])
      } else {
        setAvailableStudents([])
      }
    } catch (error) {
      setFeedback({ message: messageFrom(error), isError: true })
    }
  }

  useEffect(() => { void loadGroup() }, [token])

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!state?.group) return
    const studentId = Number(new FormData(event.currentTarget).get('student_id'))
    try {
      await authenticatedJson(`/groups/${state.group.id}/members`, token, { method: 'POST', body: JSON.stringify({ student_id: studentId }) })
      setFeedback({ message: 'Aluno adicionado ao grupo.', isError: false })
      await loadGroup()
    } catch (error) {
      setFeedback({ message: messageFrom(error), isError: true })
    }
  }

  async function leaveGroup() {
    try {
      const result = await authenticatedJson('/my-group', token, { method: 'DELETE' })
      setFeedback({ message: result.detail ?? 'Você saiu do grupo.', isError: false })
      await loadGroup()
    } catch (error) {
      setFeedback({ message: messageFrom(error), isError: true })
    }
  }

  if (!state) return null
  const group = state.group
  return <>
    <section className="card">
      <h2>Meu grupo</h2>
      <p className="hint">Consulte os integrantes e, se for líder, gerencie seu grupo.</p>
      <button type="button" onClick={() => setIsGroupModalOpen(true)}>Meu grupo</button>
    </section>
    {feedback && !isGroupModalOpen && <p className={`notice ${feedback.isError ? 'error' : ''}`} role="status">{feedback.message}</p>}
    {isGroupModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsGroupModalOpen(false)}><section className="modal-card group-modal-card" role="dialog" aria-modal="true" aria-labelledby="my-group-title" onMouseDown={(event) => event.stopPropagation()}><h2 id="my-group-title">Meu grupo</h2>{!group ? <p className="hint">Você ainda não participa de um grupo. Aguarde a criação pelo professor.</p> : <><p><strong>{group.name}</strong>{state.is_leader && ' · você é o líder'}</p><p className="hint">Líder: {group.leader.name}</p><ul className="activity-list modal-student-list">{group.members.map((member) => <li key={member.id}><strong>{member.name}</strong><span>{member.email}{member.id === group.leader.id ? ' · líder' : ''}</span></li>)}</ul>{state.is_leader && <form className="management-form" onSubmit={addMember}><label>Adicionar aluno sem grupo<select name="student_id" required defaultValue=""><option value="" disabled>Selecione um aluno</option>{availableStudents.map((student) => <option key={student.id} value={student.id}>{student.name} — {student.email}</option>)}</select></label><button disabled={!availableStudents.length}>Adicionar ao grupo</button></form>}{state.is_leader && !availableStudents.length && <p className="hint">Não há alunos sem grupo disponíveis.</p>}<button type="button" className="secondary" onClick={leaveGroup}>Sair do grupo</button>{state.is_leader && group.members.length > 1 && <small>Como líder, você precisa primeiro deixar o grupo sem outros integrantes para poder sair.</small>}</>}{feedback && <p className={`notice ${feedback.isError ? 'error' : ''}`} role="status">{feedback.message}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setIsGroupModalOpen(false)}>Fechar</button></div></section></div>}
  </>
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('rsa-token') ?? '')
  const [user, setUser] = useState<User | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [uploads, setUploads] = useState<RsaUpload[]>([])
  const [uploadFeedback, setUploadFeedback] = useState<Feedback | null>(null)

  async function loadUploads(accessToken = token) {
    const response = await fetch(`${API_URL}/rsa-uploads`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const data = await response.json().catch(() => [])
    if (!response.ok) throw new Error(data.detail ?? 'Não foi possível carregar seus envios.')
    setUploads(data)
  }

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.detail ?? 'Não foi possível carregar sua conta.')
        return data as User
      })
      .then(async (currentUser) => {
        setUser(currentUser)
        if (currentUser.role !== 'student') return
        await loadUploads(token)
      })
      .catch((error) => {
        localStorage.removeItem('rsa-token')
        setToken('')
        setFeedback({ message: messageFrom(error), isError: true })
      })
  }, [token])

  useEffect(() => {
    if (!token || !uploads.some((upload) => ['queued', 'running'].includes(upload.latest_test?.status ?? ''))) return
    const timer = window.setInterval(() => loadUploads().catch((error) => setUploadFeedback({ message: messageFrom(error), isError: true })), 2000)
    return () => window.clearInterval(timer)
  }, [token, uploads])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.get('email'), password: values.get('password') }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail ?? 'E-mail ou senha inválidos.')
      localStorage.setItem('rsa-token', data.access_token)
      setToken(data.access_token)
      setFeedback(null)
    } catch (error) {
      setFeedback({ message: messageFrom(error), isError: true })
    }
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const password = String(values.get('password') ?? '')
    if (password !== String(values.get('password_confirmation') ?? '')) {
      setFeedback({ message: 'As senhas não coincidem.', isError: true })
      return
    }
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: values.get('name'), email: values.get('email'), password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail ?? 'Não foi possível criar a conta.')
      setRegisteredEmail(data.email)
      setAuthMode('login')
      setFeedback({ message: 'Cadastro realizado. Entre com seu e-mail e senha.', isError: false })
    } catch (error) {
      setFeedback({ message: messageFrom(error), isError: true })
    }
  }

  async function uploadRsa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const values = new FormData(formElement)
    const file = values.get('file')
    if (!(file instanceof File) || !file.name) {
      setUploadFeedback({ message: 'Selecione um arquivo ZIP.', isError: true })
      return
    }
    const form = new FormData()
    form.set('file', file)
    try {
      const response = await fetch(`${API_URL}/rsa-uploads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail ?? 'Não foi possível enviar o arquivo.')
      setUploads((current) => [data, ...current])
      formElement.reset()
      setUploadFeedback({ message: 'Arquivo RSA enviado com sucesso.', isError: false })
    } catch (error) {
      setUploadFeedback({ message: messageFrom(error), isError: true })
    }
  }

  async function startTest(uploadId: number) {
    try {
      const response = await fetch(`${API_URL}/rsa-uploads/${uploadId}/test`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail ?? 'Não foi possível iniciar os testes.')
      setUploads((current) => current.map((upload) => upload.id === uploadId ? { ...upload, latest_test: data } : upload))
      setUploadFeedback({ message: 'Testes iniciados. O resultado aparecerá automaticamente.', isError: false })
    } catch (error) {
      setUploadFeedback({ message: messageFrom(error), isError: true })
    }
  }

  async function startCustomTest(uploadId: number, customTest: CustomTestInput): Promise<CustomTestResult> {
    const response = await fetch(`${API_URL}/rsa-uploads/${uploadId}/custom-test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(customTest),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.detail ?? 'Não foi possível executar o teste personalizado.')
    return data as CustomTestResult
  }

  if (!token || !user) {
    return <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">MATEMÁTICA DISCRETA</p>
        <h1>RSA Project</h1>
        <p>{authMode === 'login' ? 'Entre na sua conta.' : 'Crie sua conta de aluno.'}</p>
        <div className="auth-switch" role="tablist" aria-label="Acesso à conta">
          <button className={authMode === 'login' ? 'active' : ''} type="button" onClick={() => { setAuthMode('login'); setFeedback(null) }}>Entrar</button>
          <button className={authMode === 'register' ? 'active' : ''} type="button" onClick={() => { setAuthMode('register'); setFeedback(null) }}>Cadastrar</button>
        </div>
        {authMode === 'login' ? (
          <form onSubmit={signIn}>
            <label>E-mail<input required name="email" type="email" defaultValue={registeredEmail} autoComplete="email" /></label>
            <label>Senha<input required name="password" type="password" autoComplete="current-password" /></label>
            <button>Entrar</button>
          </form>
        ) : (
          <form onSubmit={signUp}>
            <label>Nome completo<input required name="name" minLength={2} maxLength={255} autoComplete="name" /></label>
            <label>E-mail<input required name="email" type="email" autoComplete="email" /></label>
            <label>Senha<input required name="password" type="password" minLength={8} autoComplete="new-password" /></label>
            <label>Confirmar senha<input required name="password_confirmation" type="password" minLength={8} autoComplete="new-password" /></label>
            <button>Criar conta</button>
          </form>
        )}
        {feedback && <p className={`notice ${feedback.isError ? 'error' : ''}`} role="status">{feedback.message}</p>}
      </section>
    </main>
  }

  return <main className="app-shell">
    <header>
      <div><p className="eyebrow">RSA PROJECT</p><h1>Olá, {user.name}</h1><p>{user.role === 'teacher' ? 'Perfil de professor' : 'Perfil de aluno'}</p></div>
      <button className="secondary" onClick={() => { localStorage.removeItem('rsa-token'); setToken(''); setUser(null) }}>Sair</button>
    </header>
    {user.role === 'student' ? <>
      <StudentGroupPanel token={token} />
      <section className="card">
        <h2>Enviar arquivo RSA</h2>
        <p>Envie um arquivo <code>.zip</code> com <code>encoder.c</code> e <code>decoder.c</code>. O limite é de 1 MB.</p>
        <form className="upload-form" onSubmit={uploadRsa}>
          <label>Arquivo ZIP<input name="file" required type="file" accept=".zip,application/zip" /></label>
          <button>Enviar arquivo</button>
        </form>
        {uploadFeedback && <p className={`notice ${uploadFeedback.isError ? 'error' : ''}`} role="status">{uploadFeedback.message}</p>}
      </section>
      <section className="card">
        <h2>Meus envios</h2>
        {uploads.length ? <ul className="activity-list">{uploads.map((upload) => <li key={upload.id}><strong>{upload.filename}</strong><span>Enviado em {new Date(upload.uploaded_at).toLocaleString('pt-BR')}</span><TestPanel test={upload.latest_test} onTest={() => startTest(upload.id)} onCustomTest={(customTest) => startCustomTest(upload.id, customTest)} /></li>)}</ul> : <p className="hint">Você ainda não enviou nenhum arquivo.</p>}
      </section>
    </> : <TeacherDashboard token={token} />}
  </main>
}

function TestPanel({ test, onTest, onCustomTest }: { test?: RsaTest; onTest: () => void; onCustomTest: (customTest: CustomTestInput) => Promise<CustomTestResult> }) {
  const [customResult, setCustomResult] = useState<CustomTestResult | null>(null)
  const [customFeedback, setCustomFeedback] = useState<Feedback | null>(null)
  const [isCustomTesting, setIsCustomTesting] = useState(false)
  const isRunning = ['queued', 'running'].includes(test?.status ?? '')

  async function submitCustomTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setIsCustomTesting(true)
    setCustomFeedback(null)
    try {
      const result = await onCustomTest({
        p: Number(values.get('p')),
        q: Number(values.get('q')),
        e: Number(values.get('e')),
        message: String(values.get('message') ?? ''),
      })
      setCustomResult(result)
      setCustomFeedback({ message: result.status === 'passed' ? 'Teste personalizado aprovado.' : 'O teste personalizado encontrou um problema.', isError: result.status !== 'passed' })
    } catch (error) {
      setCustomResult(null)
      setCustomFeedback({ message: messageFrom(error), isError: true })
    } finally {
      setIsCustomTesting(false)
    }
  }

  return <div className="test-result">
    {!test ? <button type="button" onClick={onTest}>Executar bateria oficial</button> : isRunning ? <p className="hint">Bateria oficial em andamento…</p> : <><strong>{test.approved} de {test.total} testes aprovados ({test.score_percent}%)</strong><span>{test.failed} falhas · {test.errored} erros</span>{test.last_error && <small>{test.last_error}</small>}<div className="buckets">{PRIME_DIGITS.map((digits) => { const bucket = test.buckets[String(digits)] ?? { total: 0, approved: 0, failed: 0, errored: 0 }; return <div key={digits}><strong>{digits} dígitos</strong><span>{bucket.approved}/{bucket.total}</span></div> })}</div><button type="button" onClick={onTest}>Executar novamente a bateria oficial</button></>}
    <details className="custom-test">
      <summary>Executar teste personalizado</summary>
      <p className="hint">Escolha dois primos de 2 a 9 dígitos, um valor de <code>e</code> e uma mensagem ASCII imprimivel, sem aspas duplas ou barra invertida.</p>
      <form className="custom-test-form" onSubmit={submitCustomTest}>
        <label>Primo p<input name="p" type="number" min="10" max="999999999" step="1" required defaultValue="61" /></label>
        <label>Primo q<input name="q" type="number" min="10" max="999999999" step="1" required defaultValue="53" /></label>
        <label>Expoente e<input name="e" type="number" min="2" step="1" required defaultValue="17" /></label>
        <label className="custom-message">Mensagem<textarea name="message" required minLength={1} maxLength={1000} defaultValue="Mensagem de teste." /></label>
        <button disabled={isRunning || isCustomTesting}>{isCustomTesting ? 'Testando…' : 'Testar valores escolhidos'}</button>
      </form>
      {customFeedback && <p className={`notice ${customFeedback.isError ? 'error' : ''}`} role="status">{customFeedback.message}</p>}
      {customResult && <div className={`custom-result ${customResult.status}`}><strong>{customResult.status === 'passed' ? 'Aprovado' : customResult.status === 'failed' ? 'Falhou' : 'Erro de execucao'}</strong><span>Chave publica: n = {customResult.public_key.n}, e = {customResult.public_key.e}</span>{customResult.ciphertext.length > 0 && <code>Ciphertext: [{customResult.ciphertext.join(', ')}]</code>}{customResult.decrypted_message !== null && <span>Mensagem decifrada: {customResult.decrypted_message}</span>}<span>Saida bruta do decoder (stdout):</span><pre>{JSON.stringify(customResult.decoder_output)}</pre><span>Saida de erro do decoder (stderr):</span><pre>{JSON.stringify(customResult.decoder_stderr)}</pre>{customResult.error && <small>{customResult.error}</small>}<button type="button" className="secondary" onClick={() => downloadCustomResult(customResult)}>Baixar resultado em .txt</button></div>}
    </details>
  </div>
}

export default App
