import { useState } from "react";

export function ThermoReaderHelp({ local, connected }: { local: boolean; connected: boolean }) {
  const [launchRequested, setLaunchRequested] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const copyFolder = async () => {
    try { await navigator.clipboard.writeText("C:\\MS-plot"); setCopyStatus("Pasta copiada. Cole na barra de endereço do Explorador de Arquivos."); }
    catch { setCopyStatus("Copie este caminho manualmente: C:\\MS-plot"); }
  };
  return <div className="thermo-reader-help" lang="pt-BR">
    <div className="reader-location">{local ? "Versão neste computador" : "Versão online"}</div>
    <h3>{connected ? "Como abrir o leitor na próxima vez" : "Como importar seus arquivos RAW"}</h3>
    <p>Os arquivos Thermo RAW precisam do leitor instalado no computador (ProteoWizard). {local ? "Esta página pode usar esse leitor." : "A versão online não lê RAW sozinha. Use o botão abaixo para iniciar o leitor e abrir a versão local do site."}</p>
    <div className="reader-actions">
      <a className="primary-button" href="pdmsplot://open" onClick={() => setLaunchRequested(true)}>Iniciar leitor e abrir versão local</a>
      <a className="secondary-button" href="http://127.0.0.1:8765" target="_blank" rel="noopener noreferrer">Já iniciei: abrir site local</a>
    </div>
    <p className="help-text">O primeiro botão funciona no Windows após a ativação abaixo. Se o navegador perguntar, escolha abrir o aplicativo PD-MS. O segundo botão só funciona com o leitor já ligado.</p>
    {launchRequested && <p className="validation-notice" role="status">Pedido enviado ao navegador. Se nada abrir, ative o botão seguindo o passo a passo abaixo ou use Start-PDMS.cmd. Esta página não consegue confirmar se o aplicativo abriu.</p>}
    <details open={!connected}>
      <summary>Primeira vez? Ative o botão ou abra sem ele</summary>
      <ol>
        <li>Aperte <kbd>Windows</kbd> + <kbd>E</kbd> para abrir o Explorador de Arquivos.</li>
        <li>Na barra de endereço, cole <code>C:\MS-plot</code> e aperte Enter. <button type="button" className="reader-copy" onClick={() => void copyFolder()}>Copiar caminho da pasta</button></li>
        <li>Para ativar o botão do site, dê dois cliques em <strong>Ativar-botao-PDMS.cmd</strong>. Faça isso uma vez por computador e usuário do Windows. Depois, volte aqui e use <strong>Iniciar leitor e abrir versão local</strong>.</li>
        <li>Para abrir diretamente, dê dois cliques em <strong>Start-PDMS.cmd</strong>. Não é necessário digitar comandos Python.</li>
        <li>Aguarde o navegador abrir. <strong>Na nova página</strong>, entre em <strong>Thermo RAW</strong> e selecione seus arquivos.</li>
      </ol>
      {copyStatus && <p role="status">{copyStatus}</p>}
      <p className="help-text">C:\MS-plot é a pasta deste projeto no computador já configurado. Em outro computador, use a pasta em que você instalou o projeto. Se esses arquivos não existirem, atualize ou instale a cópia local do projeto; abrir apenas o endereço online não a instala.</p>
      <p className="help-text">Para retirar a ativação do botão, abra Desativar-botao-PDMS.cmd. O atalho Start-PDMS.cmd continuará disponível.</p>
    </details>
    <details>
      <summary>O que é 127.0.0.1? E se não abrir?</summary>
      <p><code>127.0.0.1:8765</code> significa “o leitor neste computador”. Esse endereço não liga o leitor: primeiro use o botão ativado ou Start-PDMS.cmd. Depois de reiniciar o computador, inicie o leitor novamente.</p>
      <p>Se aparecer um erro, abra Start-PDMS.cmd: a janela mostra o que está faltando. Em um computador novo, é preciso instalar o projeto, Python, Node.js e ProteoWizard com suporte Thermo. O botão não instala esses programas.</p>
      <p>“Importação em lote” significa escolher vários arquivos de uma vez, por exemplo todas as réplicas.</p>
    </details>
    <p className="reader-transfer"><strong>Já começou um projeto na versão online?</strong> Use <strong>Save project file</strong> e depois <strong>Open project file</strong> na versão local, ou salve e abra pela sua conta no menu de projetos na nuvem. As duas páginas não compartilham automaticamente os dados do navegador.</p>
  </div>;
}
