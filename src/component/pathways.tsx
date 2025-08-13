import {
  DownloadOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Button, Input, message, Table, Upload, UploadProps } from 'antd';
import axios from 'axios';
import * as Papa from 'papaparse';
import { useEffect, useState } from 'react';

interface PathwayRow {
  id?: string; // Add unique id field
  key?: number; // Add key for table rendering
  Pathway: string;
  'Pathway Class': string;
  Subclass: string;
  Species: string;
  Source: string;
  URL: string;
  'UniProt IDS'?: string;
  Pathway_Class_assigned?: string;
  Subclass_assigned?: string;
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

// Helper function to generate unique ID
const generateUniqueId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

const PathwaysPage = () => {
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [data, setData] = useState<PathwayRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [originalData, setOriginalData] = useState<PathwayRow[]>([]); // Store original parsed data
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [processingTime, setProcessingTime] = useState<string>('');
  const [totalPathways, setTotalPathways] = useState<number>(0);
  const [progress, setProgress] = useState<{
    message: string;
    processed: number;
    total: number;
    percentage: number;
  } | null>(null);
  const [isFreshClassification, setIsFreshClassification] = useState(false);

  // Reset pagination when search text changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchText]);

  // Function to process data and update state with streaming
  const processData = async (pathwaysData: PathwayRow[]) => {
    await processDataInternal(pathwaysData, false);
  };

  // Function to process data with cache reset
  const processDataWithCacheReset = async (pathwaysData: PathwayRow[]) => {
    await processDataInternal(pathwaysData, true);
  };

  // Internal function to handle data processing
  const processDataInternal = async (
    pathwaysData: PathwayRow[],
    resetCache: boolean
  ) => {
    setLoading(true);
    setProgress(null);

    try {
      // Try streaming API first, fallback to regular API
      try {
        const response = await fetch('/api/pathways-assign-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pathways: pathwaysData,
            resetCache: resetCache,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'progress') {
                  setProgress({
                    message: data.message,
                    processed: data.processed,
                    total: data.total,
                    percentage: data.percentage,
                  });
                } else if (data.type === 'complete') {
                  // Add unique IDs to each row
                  const dataWithIds = (data.preview || []).map(
                    (row: PathwayRow, index: number) => ({
                      ...row,
                      id: generateUniqueId(),
                      key: index,
                    })
                  );

                  setData(dataWithIds);
                  
                  // Create sorted TSV for download (sorted by AI classifications)
                  const sortedDataForDownload = [...dataWithIds].sort((a, b) => {
                    // First sort by AI Class Assigned
                    const classA = a.Pathway_Class_assigned || '';
                    const classB = b.Pathway_Class_assigned || '';
                    const classComparison = classA.localeCompare(classB);
                    
                    if (classComparison !== 0) {
                      return classComparison;
                    }
                    
                    // If classes are the same, sort by AI Subclass Assigned
                    const subclassA = a.Subclass_assigned || '';
                    const subclassB = b.Subclass_assigned || '';
                    return subclassA.localeCompare(subclassB);
                  });

                  // Convert sorted data to TSV format
                  const headers = ['Pathway', 'Pathway Class', 'Subclass', 'Species', 'Source', 'URL', 'UniProt IDS', 'AI Class Assigned', 'AI Subclass Assigned'];
                  const tsvContent = [
                    headers.join('\t'),
                    ...sortedDataForDownload.map(row => [
                      row.Pathway || '',
                      row['Pathway Class'] || '',
                      row.Subclass || '',
                      row.Species || '',
                      row.Source || '',
                      row.URL || '',
                      row['UniProt IDS'] || '',
                      row.Pathway_Class_assigned || '',
                      row.Subclass_assigned || ''
                    ].join('\t'))
                  ].join('\n');

                  const blob = new Blob([tsvContent], {
                    type: 'text/tab-separated-values',
                  });
                  const url = URL.createObjectURL(blob);
                  setDownloadUrl(url);

                  setProcessingTime(data.processingTime || '');
                  setTotalPathways(data.totalPathways || 0);
                  setCurrentPage(1);
                  setProgress(null);
                  setIsFreshClassification(false);
                } else if (data.error) {
                  message.error(data.error);
                  setProgress(null);
                }
              } catch (parseError) {
                console.error('Error parsing SSE data:', parseError);
              }
            }
          }
        }
      } catch (streamingError) {
        console.log(
          'Streaming API failed, falling back to regular API:',
          streamingError
        );

        // Fallback to regular API
        const response = await axios.post('/api/pathways-assign', {
          pathways: pathwaysData,
          resetCache: resetCache,
        });

        if (!response || !response.data) {
          message.error('No response received from server.');
          return;
        }

        if (response.status !== 200 || !response.data.tsv) {
          message.error('Unexpected server error or malformed response.');
          return;
        }

        // Add unique IDs to each row
        const dataWithIds = (response.data.preview || []).map(
          (row: PathwayRow, index: number) => ({
            ...row,
            id: generateUniqueId(),
            key: index,
          })
        );

        setData(dataWithIds);
        
        // Create sorted TSV for download (sorted by AI classifications)
        const sortedDataForDownload = [...dataWithIds].sort((a, b) => {
          // First sort by AI Class Assigned
          const classA = a.Pathway_Class_assigned || '';
          const classB = b.Pathway_Class_assigned || '';
          const classComparison = classA.localeCompare(classB);
          
          if (classComparison !== 0) {
            return classComparison;
          }
          
          // If classes are the same, sort by AI Subclass Assigned
          const subclassA = a.Subclass_assigned || '';
          const subclassB = b.Subclass_assigned || '';
          return subclassA.localeCompare(subclassB);
        });

        // Convert sorted data to TSV format
        const headers = ['Pathway', 'Pathway Class', 'Subclass', 'Species', 'Source', 'URL', 'UniProt IDS', 'AI Class Assigned', 'AI Subclass Assigned'];
        const tsvContent = [
          headers.join('\t'),
          ...sortedDataForDownload.map(row => [
            row.Pathway || '',
            row['Pathway Class'] || '',
            row.Subclass || '',
            row.Species || '',
            row.Source || '',
            row.URL || '',
            row['UniProt IDS'] || '',
            row.Pathway_Class_assigned || '',
            row.Subclass_assigned || ''
          ].join('\t'))
        ].join('\n');

        const blob = new Blob([tsvContent], {
          type: 'text/tab-separated-values',
        });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);

        setProcessingTime(response.data.processingTime || '');
        setTotalPathways(response.data.totalPathways || 0);
        setCurrentPage(1);
        setIsFreshClassification(false);
      }
    } catch (err: any) {
      console.error('API error:', err);
      message.error('Server error. Check network or try again later.');
      setProgress(null);
      setIsFreshClassification(false);
    } finally {
      setLoading(false);
    }
  };

  // Function to refresh/reprocess the same data
  const handleRefresh = () => {
    if (originalData.length === 0) {
      message.warning('No data to refresh. Please upload a file first.');
      return;
    }
    setIsFreshClassification(true);
    console.log(
      'Cache reset requested - fresh classification will be performed'
    );
    message.info(
      'Re-processing the same data with fresh AI classification (cache cleared)...'
    );
    processDataWithCacheReset(originalData);
  };

  const props: UploadProps = {
    name: 'file',
    accept: '.tsv',
    beforeUpload: (file) => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        message.error('File size exceeds 20 MB. Please upload a smaller file.');
        return false;
      }

      Papa.parse<PathwayRow>(file, {
        header: true,
        delimiter: '\t',
        complete: async (result) => {
          // Store the original parsed data for refresh functionality
          setOriginalData(result.data);
          // Process the data (without cache reset for initial upload)
          await processData(result.data);
        },
        error: (error) => {
          message.error(
            'Failed to parse TSV file. Please ensure format is correct.'
          );
          console.error('Parsing error:', error);
          setLoading(false);
        },
      });

      return false;
    },
  };

  const filteredData = data.filter((row) =>
    Object.values(row).some((val) =>
      val?.toString().toLowerCase().includes(searchText.toLowerCase())
    )
  );

  // Sort data by AI classifications (Class first, then Subclass)
  const sortedData = [...filteredData].sort((a, b) => {
    // First sort by AI Class Assigned
    const classA = a.Pathway_Class_assigned || '';
    const classB = b.Pathway_Class_assigned || '';
    const classComparison = classA.localeCompare(classB);
    
    if (classComparison !== 0) {
      return classComparison;
    }
    
    // If classes are the same, sort by AI Subclass Assigned
    const subclassA = a.Subclass_assigned || '';
    const subclassB = b.Subclass_assigned || '';
    return subclassA.localeCompare(subclassB);
  });

  const columns = [
    {
      title: 'Pathway',
      dataIndex: 'Pathway',
      width: 220,
      sorter: (a: PathwayRow, b: PathwayRow) => a.Pathway.localeCompare(b.Pathway),
    },
    {
      title: 'Species',
      dataIndex: 'Species',
      width: 120,
      sorter: (a: PathwayRow, b: PathwayRow) => a.Species.localeCompare(b.Species),
    },
    {
      title: 'Source',
      dataIndex: 'Source',
      width: 150,
      sorter: (a: PathwayRow, b: PathwayRow) => a.Source.localeCompare(b.Source),
    },
    {
      title: 'URL',
      dataIndex: 'URL',
      width: 200,
      render: (url: string) => (
        <a
          href={url}
          target='_blank'
          rel='noopener noreferrer'
          style={{ fontSize: 12, wordBreak: 'break-all' }}
        >
          {url?.replace(/^https?:\/\//, '') || url || ''}
        </a>
      ),
    },
    {
      title: 'AI Class Assigned',
      dataIndex: 'Pathway_Class_assigned',
      width: 180,
      sorter: (a: PathwayRow, b: PathwayRow) => (a.Pathway_Class_assigned || '').localeCompare(b.Pathway_Class_assigned || ''),
      render: (value: string) => (
        <span className="font-medium text-green-700">{value || 'None'}</span>
      ),
    },
    {
      title: 'AI Subclass Assigned',
      dataIndex: 'Subclass_assigned',
      width: 180,
      sorter: (a: PathwayRow, b: PathwayRow) => (a.Subclass_assigned || '').localeCompare(b.Subclass_assigned || ''),
      render: (value: string) => (
        <span className="text-xs font-medium text-purple-700">{value || 'None'}</span>
      ),
    },
  ];

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6 font-sans font-inter-tight'>
      {/* Main Container */}
      <div className='max-w-7xl mx-auto font-sans font-inter-tight'>
        {/* Header Section */}
        <div className='text-center mb-12 animate-fade-in main-header font-sans'>
          <h1 className='text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent mb-4 font-sans'>
            AI Pathway Classification
          </h1>
          <p className='text-base text-slate-600 max-w-2xl mx-auto font-sans'>
            Upload your pathways data and let our AI intelligently classify and
            reassign pathway classes with advanced machine learning. Results are automatically sorted by AI classifications for easy analysis.
          </p>
        </div>

        {/* Main Content Card */}
        <div className='bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg border border-white/20 p-8 mb-8 animate-slide-up font-sans'>
          {/* Upload Section */}
          <div className='mb-8 font-sans'>
            <div className='text-center mb-6 font-sans'>
              <h2 className='text-xl font-semibold text-slate-800 mb-2 font-sans'>
                Upload Your Data
              </h2>
              <p className='text-sm text-slate-600 font-sans'>
                Start by uploading your pathways TSV file
              </p>
            </div>

            <div className='flex justify-center font-sans'>
              <Upload {...props} showUploadList={false}>
                <Button
                  size='large'
                  className='bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 border-0 text-white px-6 py-3 h-auto text-base font-medium rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 font-sans'
                >
                  <div className='flex items-center gap-3 font-sans'>
                    <UploadOutlined className='text-xl' />
                    <span className='font-sans'>
                      Upload pathways TSV file
                    </span>
                  </div>
                </Button>
              </Upload>
            </div>
          </div>

          {/* Action Buttons */}
          {(downloadUrl || originalData.length > 0) && (
            <div
              className='flex justify-center gap-4 mb-8 animate-fade-in'
              style={{ fontFamily: 'Inter Tight, sans-serif' }}
            >
              {downloadUrl && (
                <a href={downloadUrl} download='pathways_class_reassigned.tsv'>
                  <Button
                    type='primary'
                    size='large'
                    className='bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 border-0 text-white px-5 py-2 h-auto text-sm font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105'
                  >
                    <div className='flex items-center gap-2'>
                      <DownloadOutlined />
                      <span>Download Results</span>
                    </div>
                  </Button>
                </a>
              )}

              {originalData.length > 0 && (
                <Button
                  onClick={handleRefresh}
                  disabled={loading}
                  size='large'
                  className='bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 border-0 text-white px-5 py-2 h-auto text-sm font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none'
                >
                  <div className='flex items-center gap-2'>
                    <ReloadOutlined className={loading ? 'animate-spin' : ''} />
                    <span>
                      {isFreshClassification && loading
                        ? 'Fresh AI Classification...'
                        : 'Refresh AI Classification'}
                    </span>
                  </div>
                </Button>
              )}
            </div>
          )}

          {/* Search Section */}
          {data.length > 0 && (
            <div
              className='mb-8 animate-fade-in'
              style={{ fontFamily: 'Inter Tight, sans-serif' }}
            >
              <div
                className='text-center mb-4'
                style={{ fontFamily: 'Inter Tight, sans-serif' }}
              >
                <h3
                  className='text-lg font-semibold text-slate-800 mb-2'
                  style={{ fontFamily: 'Inter Tight, sans-serif' }}
                >
                  Search & Filter
                </h3>
                <p
                  className='text-sm text-slate-600'
                  style={{ fontFamily: 'Inter Tight, sans-serif' }}
                >
                  Find specific pathways in your results
                </p>
              </div>
              <div
                className='flex justify-center'
                style={{ fontFamily: 'Inter Tight, sans-serif' }}
              >
                <Input.Search
                  placeholder='Search across all fields...'
                  allowClear
                  enterButton
                  onSearch={(value) => setSearchText(value)}
                  onChange={(e) => setSearchText(e.target.value)}
                  className='max-w-md'
                  size='large'
                  style={{
                    borderRadius: '12px',
                    fontFamily: 'Inter Tight, sans-serif',
                  }}
                />
              </div>
            </div>
          )}

          {/* Loading State with Progress */}
          {loading && (
            <div className='text-center py-12 animate-fade-in'>
              <div className='inline-flex flex-col items-center gap-4 bg-white/60 backdrop-blur-sm rounded-2xl px-8 py-6 shadow-md max-w-md'>
                <div className='relative'>
                  <div className='w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin'></div>
                </div>
                <div className='text-center'>
                  <p className='text-base font-medium text-slate-800'>
                    {isFreshClassification
                      ? 'Fresh AI Classification...'
                      : 'Processing with AI...'}
                  </p>
                  {progress ? (
                    <div className='mt-3'>
                      <p className='text-sm text-slate-600 mb-2'>
                        {progress.message}
                      </p>
                      <div className='w-full bg-gray-200 rounded-full h-2 mb-2'>
                        <div
                          className='bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300'
                          style={{ width: `${progress.percentage}%` }}
                        ></div>
                      </div>
                      <p className='text-xs text-slate-500'>
                        {progress.processed} of {progress.total} pathways
                        processed ({progress.percentage}%)
                      </p>
                    </div>
                  ) : (
                    <p className='text-sm text-slate-600'>
                      Analyzing your pathways data
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Results Table */}
          {!loading && data.length > 0 && (
            <div className='animate-fade-in'>
              <div className='text-center mb-6'>
                <h3 className='text-lg font-semibold text-slate-800 mb-2'>
                  Classification Results
                </h3>
                <p className='text-sm text-slate-600'>
                  Showing {sortedData.length} of {data.length} pathways
                  {processingTime && (
                    <span className='ml-2 text-green-600 font-medium'>
                      • Processed in {processingTime} seconds
                    </span>
                  )}
                </p>
                <p className='text-xs text-slate-500 mt-1'>
                  Results are automatically sorted by AI Class and Subclass assignments
                </p>
                <p className='text-xs text-slate-500 mt-1'>
                  UniProt IDS data is included in the downloadable file
                </p>
                <p className='text-xs text-slate-500 mt-1'>
                  Downloaded file maintains the same AI classification sorting
                </p>
                {totalPathways > 0 && (
                  <p className='text-xs text-slate-500 mt-1'>
                    Total pathways processed: {totalPathways}
                  </p>
                )}
              </div>

              <div className='bg-white/60 backdrop-blur-sm rounded-2xl border border-white/20 overflow-hidden'>
                <Table
                  dataSource={sortedData}
                  columns={columns}
                  rowKey='key'
                  key={`table-${currentPage}-${pageSize}`}
                  expandable={{
                    expandedRowRender: (record) => (
                      <div className='bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl m-4'>
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                          <div className='space-y-3'>
                            <div className='bg-white/80 rounded-lg p-3 shadow-sm'>
                              <p className='text-xs font-medium text-slate-700 mb-1'>
                                Original Pathway Class
                              </p>
                              <p className='text-sm text-slate-900'>
                                {record['Pathway Class'] || 'None'}
                              </p>
                            </div>
                            <div className='bg-white/80 rounded-lg p-3 shadow-sm'>
                              <p className='text-xs font-medium text-slate-700 mb-1'>
                                Original Subclass
                              </p>
                              <p className='text-sm text-slate-900'>
                                {record['Subclass'] || 'None'}
                              </p>
                            </div>
                          </div>
                          <div className='space-y-3'>
                            <div className='bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-3 shadow-sm border border-green-200'>
                              <p className='text-xs font-medium text-green-700 mb-1'>
                                AI Assigned Class
                              </p>
                              <p className='text-sm text-green-900 font-medium'>
                                {record['Pathway_Class_assigned'] || 'None'}
                              </p>
                            </div>
                            <div className='bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-3 shadow-sm border border-purple-200'>
                              <p className='text-xs font-medium text-purple-700 mb-1'>
                                AI Assigned Subclass
                              </p>
                              <p className='text-sm text-purple-900 font-medium'>
                                {record['Subclass_assigned'] || 'None'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ),
                  }}
                  pagination={{
                    pageSize: pageSize,
                    current: currentPage,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total, range) =>
                      `${range[0]}-${range[1]} of ${total} items`,
                    className: 'pagination-custom',
                    total: sortedData.length,
                    onChange: (page, newPageSize) => {
                      setCurrentPage(page);
                      if (newPageSize !== pageSize) {
                        setPageSize(newPageSize);
                        setCurrentPage(1); // Reset to first page when page size changes
                      }
                    },
                    onShowSizeChange: (current, size) => {
                      setPageSize(size);
                      setCurrentPage(1); // Reset to first page when page size changes
                    },
                  }}
                  scroll={{ x: true }}
                  className='custom-table text-sm'
                  size='small'
                />
              </div>
            </div>
          )}

          {/* Empty State - Redesigned */}
          {!loading && data.length === 0 && (
            <div
              className='grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in'
              style={{ fontFamily: 'Inter Tight, sans-serif' }}
            >
              {/* Main Info Card */}
              <div
                className='lg:col-span-2 bg-white/90 backdrop-blur-sm rounded-2xl shadow-sm border border-white/30 p-8'
                style={{ fontFamily: 'Inter Tight, sans-serif' }}
              >
                <div
                  className='flex items-start gap-4 mb-6'
                  style={{ fontFamily: 'Inter Tight, sans-serif' }}
                >
                  <div className='w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-sm'>
                    <UploadOutlined className='text-lg text-white' />
                  </div>
                  <div style={{ fontFamily: 'Inter Tight, sans-serif' }}>
                    <h3
                      className='text-xl font-semibold text-slate-800 mb-2'
                      style={{ fontFamily: 'Inter Tight, sans-serif' }}
                    >
                      Get Started with AI Classification
                    </h3>
                    <p
                      className='text-slate-600 leading-relaxed'
                      style={{ fontFamily: 'Inter Tight, sans-serif' }}
                    >
                      Transform your biological pathways data with intelligent
                      AI classification. Upload your TSV file and get instant,
                      accurate pathway class assignments with automatic sorting by AI classifications.
                    </p>
                  </div>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div className='bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200'>
                    <div className='flex items-center gap-3 mb-2'>
                      <div className='w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center'>
                        <span className='text-white text-sm font-bold'>1</span>
                      </div>
                      <h4 className='font-semibold text-green-800'>
                        Upload File
                      </h4>
                    </div>
                    <p className='text-sm text-green-700'>
                      Upload your pathways TSV file using the button above
                    </p>
                  </div>

                  <div className='bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-200'>
                    <div className='flex items-center gap-3 mb-2'>
                      <div className='w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center'>
                        <span className='text-white text-sm font-bold'>2</span>
                      </div>
                      <h4 className='font-semibold text-purple-800'>
                        AI Processing
                      </h4>
                    </div>
                    <p className='text-sm text-purple-700'>
                      Our AI analyzes and classifies each pathway automatically
                    </p>
                  </div>

                  <div className='bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200'>
                    <div className='flex items-center gap-3 mb-2'>
                      <div className='w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center'>
                        <span className='text-white text-sm font-bold'>3</span>
                      </div>
                      <h4 className='font-semibold text-blue-800'>
                        Get Results
                      </h4>
                    </div>
                    <p className='text-sm text-blue-700'>
                      Download your classified data and view detailed results
                    </p>
                  </div>

                  <div className='bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-200'>
                    <div className='flex items-center gap-3 mb-2'>
                      <div className='w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center'>
                        <span className='text-white text-sm font-bold'>4</span>
                      </div>
                      <h4 className='font-semibold text-orange-800'>
                        Refine & Improve
                      </h4>
                    </div>
                    <p className='text-sm text-orange-700'>
                      Use the refresh button to get alternative classifications
                    </p>
                  </div>
                </div>
              </div>

              {/* Side Info Card */}
              <div className='bg-white/90 backdrop-blur-sm rounded-2xl shadow-sm border border-white/30 p-6'>
                <h4 className='font-semibold text-slate-800 mb-4'>
                  File Requirements
                </h4>

                <div className='space-y-4'>
                  <div className='flex items-center gap-3 p-3 bg-slate-50 rounded-lg'>
                    <div className='w-8 h-8 bg-slate-500 rounded-lg flex items-center justify-center'>
                      <span className='text-white text-xs font-bold'>TSV</span>
                    </div>
                    <div>
                      <p className='text-sm font-medium text-slate-800'>
                        Tab-separated values
                      </p>
                      <p className='text-xs text-slate-600'>Required format</p>
                    </div>
                  </div>

                  <div className='flex items-center gap-3 p-3 bg-slate-50 rounded-lg'>
                    <div className='w-8 h-8 bg-slate-500 rounded-lg flex items-center justify-center'>
                      <span className='text-white text-xs font-bold'>20MB</span>
                    </div>
                    <div>
                      <p className='text-sm font-medium text-slate-800'>
                        Maximum file size
                      </p>
                      <p className='text-xs text-slate-600'>
                        For optimal processing
                      </p>
                    </div>
                  </div>

                  <div className='flex items-center gap-3 p-3 bg-slate-50 rounded-lg'>
                    <div className='w-8 h-8 bg-slate-500 rounded-lg flex items-center justify-center'>
                      <span className='text-white text-xs font-bold'>✓</span>
                    </div>
                    <div>
                      <p className='text-sm font-medium text-slate-800'>
                        Pathway data
                      </p>
                      <p className='text-xs text-slate-600'>
                        Biological pathways
                      </p>
                    </div>
                  </div>
                </div>

                <div className='mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200'>
                  <div className='flex items-center gap-2 text-sm text-blue-700'>
                    <div className='w-2 h-2 bg-blue-500 rounded-full'></div>
                    <span className='font-medium'>Expected columns:</span>
                  </div>
                  <p className='text-xs text-blue-600 mt-1'>
                    Pathway, Pathway Class, Subclass, Species, Source, URL, UniProt IDS
                  </p>
                  <p className='text-xs text-blue-500 mt-1'>
                    Note: UniProt IDS will be included in downloaded files but hidden from the table view
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom CSS for animations and table styling */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }

        .animate-slide-up {
          animation: slide-up 0.8s ease-out;
        }

        .custom-table .ant-table-thead > tr > th {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-weight: 600;
          border: none;
        }

        .custom-table .ant-table-tbody > tr:hover > td {
          background: linear-gradient(135deg, #f0f4ff 0%, #e6f3ff 100%);
        }

        .custom-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f0f0f0;
          padding: 16px;
        }

        .pagination-custom .ant-pagination-item {
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .pagination-custom .ant-pagination-item-active {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-color: #667eea;
        }

        .pagination-custom .ant-pagination-item-active a {
          color: white;
        }
      `}</style>
    </div>
  );
};

export default PathwaysPage;
