type Props = {hasFiles: boolean; hasLegacyFiles: boolean; loading: boolean; onExamples: () => void; onPhotodepletion: () => void};

export function DataSources({hasFiles, hasLegacyFiles, loading, onExamples, onPhotodepletion}: Props) {
  return <section className="workspace-section data-sources">
    <p className="section-kicker">Dados → análise → figura</p>
    <h2>{hasFiles ? "Fontes dos dados" : "Comece pelos seus TXT ou por uma tabela"}</h2>
    <p>Use os TXT de averages que você já guarda no MS Catalog ou exporta pelo Xcalibur. Escolha os arquivos que entram na análise; cada average permanece identificado separadamente.</p>
    <div className="welcome-actions">
      <a className="secondary-button" href="https://molecule-ms-catalog.vercel.app/#catalog" target="_blank" rel="noreferrer">Abrir MS Catalog ↗</a>
      <button type="button" className="secondary-button" onClick={onPhotodepletion}>Tabela / pares de Photodepletion</button>
      <a className="secondary-button" href="https://ms-generator.vercel.app/" target="_blank" rel="noreferrer">Figuras de espectros no MS Generator ↗</a>
      {!hasFiles && <button type="button" className="secondary-button" disabled={loading} onClick={onExamples}>Try sample data</button>}
    </div>
    <p>Para gráficos gerais, importe os TXT abaixo, confira as condições em Files & metadata, escolha os íons e abra Plot. Photodepletion é um modo opcional para pares LED OFF/ON.</p>
    <details><summary>Como preparar os TXT e identificar os averages</summary>
      <ol>
        <li>No catálogo, escolha e baixe os TXT dos averages que deseja comparar. Você também pode usar um average exportado manualmente pelo Xcalibur.</li>
        <li>O TXT deve ter duas colunas numéricas: m/z e intensidade, separadas por espaços ou tabulações. Preserve a precisão exportada.</li>
        <li>Registre a aquisição/RAW de origem, o average ou intervalo de scans e as condições de cada arquivo. Averages distintos do mesmo RAW não são réplicas experimentais independentes.</li>
        <li>Para Photodepletion, use intensidades OFF/ON em escala comparável. Intensidades normalizadas individualmente ao pico-base são insuficientes. Não altere a escala do TXT só para desenhar a figura.</li>
        <li>Selecione explicitamente os pares e revise os nomes dos arquivos antes do ajuste e da exportação.</li>
      </ol>
      <p>O TXT médio não contém os scans originais. Para mudar o average, faça uma nova exportação no Xcalibur ou use o processamento do catálogo.</p>
    </details>
    {hasLegacyFiles && <p className="validation-notice">Projeto antigo com dados Thermo/Bruker: dados, seleção de scans e métodos salvos foram preservados para reproduzir os gráficos. O processamento de novas aquisições e a edição de scans ficam fora deste editor.</p>}
  </section>;
}
