import { useWizardContext } from '../WizardContext';
import styles from '../../../styles/scriptAdapter.module.css';
import { pickLocalFile, uploadBook, listBooks } from '../../../services/aiLibraryClient';
import { CreationRangeMode } from '../index';

export function StepSource() {
  const context = useWizardContext();
  const {
    sourceMode, setSourceMode,
    libraryStatus, libraryBooks,
    selectedBook, selectedBookId, setSelectedBookId,
    selectedChapterIndex, setSelectedChapterIndex,
    libraryChapters, selectedRangeMode, setSelectedRangeMode,
    selectedRangeEndIndex, setSelectedRangeEndIndex,
    selectedRangeChapters, selectedRangeTotalChars,
    selectedChapter, chapterPreview,
    uploadFilePath, setUploadFilePath,
    uploadTitle, setUploadTitle,
    uploadAuthor, setUploadAuthor,
    uploadingBook, setUploadingBook,
    setLibraryError,
    pastedText, setPastedText
  } = context;

  const handlePickUploadFile = async () => {
    const filePath = await pickLocalFile();
    if (!filePath) return;
    setUploadFilePath(filePath);
    if (!uploadTitle.trim()) {
      setUploadTitle((filePath.split(/[\\/]/).pop() || '').replace(/\.(txt|md)$/i, ''));
    }
  };

  const refreshLibraryBooks = async () => {
    try {
      const books = await listBooks();
      // Use local logic if we don't pass setter
      return books;
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '项目素材库刷新失败');
      return [];
    }
  };

  const handleUploadIntoLibrary = async () => {
    if (!uploadFilePath) {
      setLibraryError('请先选择一个 .txt 或 .md 文件');
      return;
    }
    if (!uploadTitle.trim()) {
      setLibraryError('请先填写书名');
      return;
    }

    setUploadingBook(true);
    setLibraryError('');
    try {
      const uploaded = await uploadBook({
        filePath: uploadFilePath,
        title: uploadTitle.trim(),
        author: uploadAuthor.trim() || undefined,
      });
      const books = await refreshLibraryBooks();
      const nextBook = books.find((book) => book.id === uploaded.book_id) || books[0];
      if (nextBook) {
        setSelectedBookId(nextBook.id);
        setSourceMode('library');
      }
      setUploadFilePath('');
      setUploadTitle('');
      setUploadAuthor('');
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '上传到项目素材库失败');
    } finally {
      setUploadingBook(false);
    }
  };

  const sourceConfirmed = context.intakeResult !== null;

  return (
    <div className={`${styles.card} ${styles.composerGateCard}`}>
      <div className={styles.composerSectionHeader}>
        <div>
          <div className={styles.detailEyebrow}>第 1 步 · 素材确认</div>
          <h2>确认本次任务素材</h2>
          <p className={styles.sectionLead}>选择要处理的书和章节。确认后系统会自动解析素材，并带你进入目标配置。</p>
        </div>
        <span className={sourceConfirmed ? styles.composerStatePill : styles.reviewPill}>
          {sourceConfirmed ? '已确认' : '待确认'}
        </span>
      </div>

      <div className={styles.sourceGateLayout}>
        <div className={styles.sourcePrimaryColumn}>
          <div className={styles.sourceModeHeader}>
            <strong>素材来源</strong>
            <span>优先复用当前项目素材库里的书和章节；只有缺素材时，才在这里补充上传。</span>
          </div>
          <div className={styles.choiceGrid}>
            <button
              type="button"
              className={sourceMode === 'library' ? styles.choiceCardActive : styles.choiceCard}
              onClick={() => setSourceMode('library')}
            >
              项目素材库
            </button>
            <button
              type="button"
              className={sourceMode === 'upload' ? styles.choiceCardActive : styles.choiceCard}
              onClick={() => setSourceMode('upload')}
            >
              上传新文件
            </button>
            <button
              type="button"
              className={sourceMode === 'paste' ? styles.choiceCardActive : styles.choiceCard}
              onClick={() => setSourceMode('paste')}
            >
              粘贴试跑
            </button>
          </div>

          {sourceMode === 'library' ? (
            <div className={styles.sourceLibraryPanel}>
              <div className={styles.sourceLibraryHeaderRow}>
                <strong>当前项目已有素材</strong>
                <span>
                  {libraryStatus === 'loading-books'
                    ? '正在读取项目素材库...'
                    : libraryBooks.length > 0
                      ? `${libraryBooks.length} 份素材`
                      : '还没有已上传素材'}
                </span>
              </div>

              {libraryBooks.length === 0 ? (
                <div className={styles.mockUploadBox}>
                  <strong>当前项目还没有素材</strong>
                  <span>先切到“上传新文件”，把小说放进项目素材库，再回来选章节。</span>
                </div>
              ) : null}

              {selectedBook ? (
                <>
                  <div className={styles.sourceSelectionGrid}>
                    <label className={styles.sourceSelectField}>
                      <span>选中的书</span>
                      <select value={selectedBookId} onChange={(event) => setSelectedBookId(event.target.value)}>
                        {libraryBooks.map((book: any) => (
                          <option key={book.id} value={book.id}>
                            {book.title}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.sourceSelectField}>
                      <span>起始章节</span>
                      <select
                        value={selectedChapterIndex === '' ? '' : String(selectedChapterIndex)}
                        onChange={(event) => {
                          const next = event.target.value === '' ? '' : Number(event.target.value);
                          setSelectedChapterIndex(next);
                          if (selectedRangeMode === 'single') setSelectedRangeEndIndex(next);
                        }}
                      >
                        <option value="">{libraryStatus === 'loading-chapters' ? '章节加载中...' : '请选择一章'}</option>
                        {libraryChapters.map((chapter) => (
                          <option key={chapter.id} value={String(chapter.chapter_index)}>
                            {chapter.title || `第 ${chapter.chapter_index + 1} 章`}（{chapter.char_count ?? '?'} 字）
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className={styles.creationRangeCard}>
                    <div className={styles.taskFieldLabel}>本次处理范围</div>
                    <div className={styles.creationRangeTabs}>
                      {[
                        ['single', '单章试产'],
                        ['range', '小批量范围'],
                        ['all', '全书规划'],
                      ].map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          className={selectedRangeMode === mode ? styles.batchModeTabActive : styles.batchModeTab}
                          onClick={() => {
                            setSelectedRangeMode(mode as CreationRangeMode);
                            if (mode === 'single') setSelectedRangeEndIndex(selectedChapterIndex);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {selectedRangeMode === 'range' ? (
                      <label className={styles.sourceSelectField}>
                        <span>结束章节</span>
                        <select
                          value={selectedRangeEndIndex === '' ? '' : String(selectedRangeEndIndex)}
                          onChange={(event) => setSelectedRangeEndIndex(event.target.value === '' ? '' : Number(event.target.value))}
                        >
                          {libraryChapters.map((chapter) => (
                            <option key={chapter.id} value={String(chapter.chapter_index)}>
                              {chapter.title || `第 ${chapter.chapter_index + 1} 章`}（{chapter.char_count ?? '?'} 字）
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <div className={styles.creationRangeSummary}>
                      <strong>范围已锁定</strong>
                      <span>
                        {selectedRangeChapters.length || 0} 章 · {selectedRangeTotalChars.toLocaleString('zh-CN')} 字。
                        {selectedRangeMode === 'all' ? ' 全书本轮只做规划确认，不建议直接真实试产。' : ' 后续工作台只展示摘要，不再重新选章。'}
                      </span>
                    </div>
                  </div>
                </>
              ) : null}

              {selectedChapter ? (
                <div className={styles.sourcePreviewCard}>
                  <div>
                    <strong>章节预览</strong>
                    <span>只展示开头片段，方便确认文本是否选对。</span>
                  </div>
                  <p>{chapterPreview || '正在加载章节预览...'}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {sourceMode === 'upload' ? (
            <div className={styles.sourceUploadPanel}>
              <div className={styles.mockUploadBox}>
                <strong>把新文件先放进当前项目素材库</strong>
                <span>支持 `.txt` / `.md`。上传成功后会自动回到“项目素材库”并选中这本书。</span>
              </div>
              <div className={styles.sourceUploadRow}>
                <button type="button" className={styles.ghostButton} onClick={() => void handlePickUploadFile()}>
                  {uploadFilePath ? '重新选择文件' : '选择文件'}
                </button>
                <span>{uploadFilePath || '未选择文件'}</span>
              </div>
              <div className={styles.sourceSelectionGrid}>
                <label className={styles.sourceSelectField}>
                  <span>书名</span>
                  <input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="例如：长夜未瞑" />
                </label>
                <label className={styles.sourceSelectField}>
                  <span>作者（可选）</span>
                  <input value={uploadAuthor} onChange={(event) => setUploadAuthor(event.target.value)} placeholder="例如：某某" />
                </label>
              </div>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={uploadingBook}
                onClick={() => void handleUploadIntoLibrary()}
              >
                {uploadingBook ? '上传中...' : '上传到项目素材库'}
              </button>
            </div>
          ) : null}

          {sourceMode === 'paste' ? (
            <div className={styles.sourceUploadPanel}>
              <div className={styles.mockUploadBox}>
                <strong>临时试跑文本</strong>
                <span>这段文本只用于快速试跑，不会自动存入项目素材库。</span>
              </div>
              <textarea
                className={styles.sourcePasteTextarea}
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                placeholder="粘贴一段临时文本，例如第 1 章开头的 1000-3000 字。"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
