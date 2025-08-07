import { DownloadOutlined, UploadOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Button,
  Input,
  message,
  Space,
  Spin,
  Table,
  Typography,
  Upload,
  UploadProps,
} from 'antd';
import axios from 'axios';
import * as Papa from 'papaparse';
import { useState } from 'react';

const { Paragraph } = Typography;

interface PathwayRow {
  id?: string; // Add unique id field
  key?: number; // Add key for table rendering
  Pathway: string;
  'Pathway Class': string;
  Subclass: string;
  Species: string;
  Source: string;
  URL: string;
  'UniProt IDS': string;
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

  // Function to process data and update state
  const processData = async (pathwaysData: PathwayRow[]) => {
    setLoading(true);
    try {
      const response = await axios.post('/api/pathways-assign', {
        pathways: pathwaysData,
      });

      if (!response || !response.data) {
        message.error('No response received from server.');
        return;
      }

      if (response.status !== 200 || !response.data.tsv) {
        message.error('Unexpected server error or malformed response.');
        return;
      }

      const blob = new Blob([response.data.tsv], {
        type: 'text/tab-separated-values',
      });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      // Add unique IDs to each row
      const dataWithIds = (response.data.preview || []).map(
        (row: PathwayRow, index: number) => ({
          ...row,
          id: generateUniqueId(),
          key: index, // Add a stable key for table rendering
        })
      );

      setData(dataWithIds);
    } catch (err: any) {
      console.error('API error:', err);
      message.error('Server error. Check network or try again later.');
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
    message.info('Re-processing the same data with AI...');
    processData(originalData);
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
          // Process the data
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

  const columns = [
    {
      title: 'Pathway',
      dataIndex: 'Pathway',
      width: 220,
    },
    {
      title: 'Species',
      dataIndex: 'Species',
      width: 120,
    },
    {
      title: 'Database',
      dataIndex: 'Source',
      key: 'Database',
      width: 200,
      render: (_: string, record: PathwayRow) => (
        <div style={{ lineHeight: 1.4 }}>
          <strong>{record.Source}</strong>
          <br />
          <a
            href={record.URL}
            target='_blank'
            rel='noopener noreferrer'
            style={{ fontSize: 12, wordBreak: 'break-all' }}
          >
            {record.URL?.replace(/^https?:\/\//, '') || record.URL || ''}
          </a>
        </div>
      ),
    },
    {
      title: 'UniProt IDS',
      dataIndex: 'UniProt IDS',
      width: 160,
      render: (text: string) => (
        <Paragraph
          ellipsis={{ rows: 1, expandable: true, symbol: 'more' }}
          style={{
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            maxWidth: 160,
            margin: 0,
          }}
        >
          {text}
        </Paragraph>
      ),
    },
    {
      title: 'Class Assigned',
      dataIndex: 'Pathway_Class_assigned',
      width: 180,
    },
    {
      title: 'Subclass Assigned',
      dataIndex: 'Subclass_assigned',
      width: 180,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      {/* Main Container */}
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="text-center mb-12 animate-fade-in main-header">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent mb-4" style={{ fontFamily: 'Mozilla Text, sans-serif' }}>
            AI Pathway Classification
          </h1>
          <p className="text-base text-slate-600 max-w-2xl mx-auto">
            Upload your pathways data and let our AI intelligently classify and reassign pathway classes with advanced machine learning
          </p>
        </div>

        {/* Main Content Card */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg border border-white/20 p-8 mb-8 animate-slide-up">
          {/* Upload Section */}
          <div className="mb-8">
                          <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-slate-800 mb-2">Upload Your Data</h2>
                <p className="text-sm text-slate-600">Start by uploading your pathways TSV file</p>
              </div>
            
            <div className="flex justify-center">
              <Upload {...props} showUploadList={false}>
                <Button 
                  size="large"
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 border-0 text-white px-6 py-3 h-auto text-base font-medium rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105"
                >
                  <div className="flex items-center gap-3">
                    <UploadOutlined className="text-xl" />
                    <span>Upload pathways_classes_proteins_all.tsv</span>
                  </div>
                </Button>
              </Upload>
            </div>
          </div>

          {/* Action Buttons */}
          {(downloadUrl || originalData.length > 0) && (
            <div className="flex justify-center gap-4 mb-8 animate-fade-in">
              {downloadUrl && (
                <a href={downloadUrl} download='pathways_class_reassigned.tsv'>
                  <Button 
                    type='primary'
                    size="large"
                    className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 border-0 text-white px-5 py-2 h-auto text-sm font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105"
                  >
                    <div className="flex items-center gap-2">
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
                  size="large"
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 border-0 text-white px-5 py-2 h-auto text-sm font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  <div className="flex items-center gap-2">
                    <ReloadOutlined className={loading ? 'animate-spin' : ''} />
                    <span>Refresh AI Classification</span>
                  </div>
                </Button>
              )}
            </div>
          )}

          {/* Search Section */}
          {data.length > 0 && (
            <div className="mb-8 animate-fade-in">
              <div className="text-center mb-4">
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Search & Filter</h3>
                <p className="text-sm text-slate-600">Find specific pathways in your results</p>
              </div>
              <div className="flex justify-center">
                <Input.Search
                  placeholder='Search across all fields...'
                  allowClear
                  enterButton
                  onSearch={(value) => setSearchText(value)}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="max-w-md"
                  size="large"
                  style={{
                    borderRadius: '12px',
                  }}
                />
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12 animate-fade-in">
              <div className="inline-flex items-center gap-4 bg-white/60 backdrop-blur-sm rounded-2xl px-8 py-6 shadow-md">
                <div className="relative">
                  <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
                <div>
                  <p className="text-base font-medium text-slate-800">Processing with AI...</p>
                  <p className="text-sm text-slate-600">Analyzing your pathways data</p>
                </div>
              </div>
            </div>
          )}

          {/* Results Table */}
          {!loading && data.length > 0 && (
            <div className="animate-fade-in">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Classification Results</h3>
                <p className="text-sm text-slate-600">
                  Showing {filteredData.length} of {data.length} pathways
                </p>
              </div>
              
              <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-white/20 overflow-hidden">
                <Table
                  dataSource={filteredData}
                  columns={columns}
                  rowKey='key'
                  expandable={{
                    expandedRowRender: (record) => (
                      <div className='bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl m-4'>
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                          <div className='space-y-3'>
                                                         <div className='bg-white/80 rounded-lg p-3 shadow-sm'>
                               <p className='text-xs font-medium text-slate-700 mb-1'>Original Pathway Class</p>
                               <p className='text-sm text-slate-900'>{record['Pathway Class'] || 'None'}</p>
                             </div>
                             <div className='bg-white/80 rounded-lg p-3 shadow-sm'>
                               <p className='text-xs font-medium text-slate-700 mb-1'>Original Subclass</p>
                               <p className='text-sm text-slate-900'>{record['Subclass'] || 'None'}</p>
                             </div>
                          </div>
                          <div className='space-y-3'>
                                                         <div className='bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-3 shadow-sm border border-green-200'>
                               <p className='text-xs font-medium text-green-700 mb-1'>AI Assigned Class</p>
                               <p className='text-sm text-green-900 font-medium'>{record['Pathway_Class_assigned'] || 'None'}</p>
                             </div>
                             <div className='bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-3 shadow-sm border border-purple-200'>
                               <p className='text-xs font-medium text-purple-700 mb-1'>AI Assigned Subclass</p>
                               <p className='text-sm text-purple-900 font-medium'>{record['Subclass_assigned'] || 'None'}</p>
                             </div>
                          </div>
                        </div>
                      </div>
                    ),
                  }}
                  pagination={{ 
                    pageSize: 10, 
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                    className: 'pagination-custom'
                  }}
                  scroll={{ x: true }}
                                     className="custom-table text-sm"
                   size="small"
                />
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && data.length === 0 && (
            <div className="text-center py-16 animate-fade-in">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-12 max-w-md mx-auto shadow-md">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                  <UploadOutlined className="text-2xl text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-3">Ready to Get Started?</h3>
                <p className="text-sm text-slate-600 mb-6">
                  Upload your pathways TSV file above to begin AI-powered classification
                </p>
                <div className="text-xs text-slate-500">
                  <p>Supported format: TSV files up to 20MB</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom CSS for animations and table styling */}
      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
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
