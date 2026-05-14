
TOOLS = [
    {
      "name": "s3_list_buckets",
      "description": "\n        List all S3 buckets accessible with the provided credentials.\n\n        Args:\n            request: ListBucketsRequest containing AWS credentials\n        ",
      "input_schema": {
        "$defs": {
          "ListBucketsRequest": {
            "description": "Input schema for s3_list_buckets.",
            "properties": {
              "aws_access_key_id": {
                "description": "AWS access key ID resolved from the selected S3 connection",
                "title": "AWS Access Key ID",
                "type": "string"
              },
              "aws_secret_access_key": {
                "description": "AWS secret access key resolved from the selected S3 connection",
                "title": "AWS Secret Access Key",
                "type": "string"
              },
              "region_name": {
                "description": "AWS region (e.g. us-east-1) resolved from the selected S3 connection",
                "title": "AWS Region",
                "type": "string"
              }
            },
            "required": [
              "aws_access_key_id",
              "aws_secret_access_key",
              "region_name"
            ],
            "title": "ListBucketsRequest",
            "type": "object"
          }
        },
        "properties": {
          "request": {
            "$ref": "#/$defs/ListBucketsRequest"
          }
        },
        "required": [
          "request"
        ],
        "title": "s3_list_bucketsArguments",
        "type": "object"
      },
      "meta": {
        "display_name": "List S3 Buckets",
        "icon": "database",
        "category": "AWS",
        "description": "List all S3 buckets accessible with the provided credentials.",
        "connection_name": {
          "type": "S3",
          "fields": ["aws_access_key_id", "aws_secret_access_key", "region_name"]
        }
      }
    },
    {
      "name": "s3_list_files_in_bucket",
      "description": "\n        List all files in a specific S3 bucket.\n\n        Args:\n            request: ListFilesInBucketRequest containing AWS credentials and bucket_name\n            bucket_name: S3 bucket name (resolved dynamically from the UI connection)\n        ",
      "input_schema": {
        "$defs": {
          "ListFilesInBucketRequest": {
            "description": "Input schema for s3_list_files_in_bucket.",
            "properties": {
              "aws_access_key_id": {
                "description": "AWS access key ID resolved from the selected S3 connection",
                "title": "AWS Access Key ID",
                "type": "string"
              },
              "aws_secret_access_key": {
                "description": "AWS secret access key resolved from the selected S3 connection",
                "title": "AWS Secret Access Key",
                "type": "string"
              },
              "region_name": {
                "description": "AWS region (e.g. us-east-1) resolved from the selected S3 connection",
                "title": "AWS Region",
                "type": "string"
              },
              "bucket_name": {
                "description": "S3 bucket name",
                "title": "Bucket Name",
                "type": "string"
              }
            },
            "required": [
              "aws_access_key_id",
              "aws_secret_access_key",
              "region_name",
              "bucket_name"
            ],
            "title": "ListFilesInBucketRequest",
            "type": "object"
          }
        },
        "properties": {
          "request": {
            "$ref": "#/$defs/ListFilesInBucketRequest"
          }
        },
        "required": [
          "request"
        ],
        "title": "s3_list_files_in_bucketArguments",
        "type": "object"
      },
      "meta": {
        "display_name": "List Files in S3 Bucket",
        "icon": "folder-open",
        "category": "AWS",
        "description": "List all files in a specific S3 bucket.",
        "connection_name": {
          "type": "S3",
          "fields": ["aws_access_key_id", "aws_secret_access_key", "region_name"]
        },
        "field_meta": {
          "bucket_name": {
            "type": "bucket"
          }
        }
      }
    },
    {
      "name": "s3_upload_file",
      "description": "\n        Upload a file to an S3 bucket.\n\n        Args:\n            request: UploadFileRequest containing AWS credentials, upload_file path, bucket, and optional key/sub_folder\n            upload_file: Local file path to upload\n            bucket: Target S3 bucket (resolved dynamically from the UI connection)\n            key: Optional S3 object key override\n            sub_folder: Optional subfolder within the bucket\n        ",
      "input_schema": {
        "$defs": {
          "UploadFileRequest": {
            "description": "Input schema for s3_upload_file.",
            "properties": {
              "aws_access_key_id": {
                "description": "AWS access key ID resolved from the selected S3 connection",
                "title": "AWS Access Key ID",
                "type": "string"
              },
              "aws_secret_access_key": {
                "description": "AWS secret access key resolved from the selected S3 connection",
                "title": "AWS Secret Access Key",
                "type": "string"
              },
              "region_name": {
                "description": "AWS region (e.g. us-east-1) resolved from the selected S3 connection",
                "title": "AWS Region",
                "type": "string"
              },
              "upload_file": {
                "description": "Local file path to upload",
                "title": "Upload File",
                "type": "string"
              },
              "bucket": {
                "description": "Target S3 bucket",
                "title": "Bucket Name",
                "type": "string"
              },
              "key": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": None,
                "description": "Optional override S3 object key",
                "title": "File Name"
              },
              "sub_folder": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": None,
                "description": "Subfolder within the bucket to upload the file",
                "title": "Sub Folder"
              }
            },
            "required": [
              "aws_access_key_id",
              "aws_secret_access_key",
              "region_name",
              "upload_file",
              "bucket"
            ],
            "title": "UploadFileRequest",
            "type": "object"
          }
        },
        "properties": {
          "request": {
            "$ref": "#/$defs/UploadFileRequest"
          }
        },
        "required": [
          "request"
        ],
        "title": "s3_upload_fileArguments",
        "type": "object"
      },
      "meta": {
        "display_name": "Upload File to S3",
        "icon": "file-up",
        "category": "AWS",
        "description": "Upload a file to an S3 bucket.",
        "connection_name": {
          "type": "S3",
          "fields": ["aws_access_key_id", "aws_secret_access_key", "region_name"]
        },
        "field_meta": {
          "bucket": {
            "type": "bucket"
          },
          "upload_file": {
            "type": "file"
          }
        }
      }
    },
    {
      "name": "s3_get_file_metadata",
      "description": "\n        Get metadata for a specific file in S3.\n\n        Args:\n            request: GetMetadataRequest containing AWS credentials, bucket, and key\n            bucket: S3 bucket name (resolved dynamically from the UI connection)\n            key: S3 object key\n        ",
      "input_schema": {
        "$defs": {
          "GetMetadataRequest": {
            "description": "Input schema for s3_get_file_metadata.",
            "properties": {
              "aws_access_key_id": {
                "description": "AWS access key ID resolved from the selected S3 connection",
                "title": "AWS Access Key ID",
                "type": "string"
              },
              "aws_secret_access_key": {
                "description": "AWS secret access key resolved from the selected S3 connection",
                "title": "AWS Secret Access Key",
                "type": "string"
              },
              "region_name": {
                "description": "AWS region (e.g. us-east-1) resolved from the selected S3 connection",
                "title": "AWS Region",
                "type": "string"
              },
              "bucket": {
                "description": "S3 bucket name",
                "title": "Bucket Name",
                "type": "string"
              },
              "key": {
                "description": "Object key in S3",
                "title": "File Name",
                "type": "string"
              }
            },
            "required": [
              "aws_access_key_id",
              "aws_secret_access_key",
              "region_name",
              "bucket",
              "key"
            ],
            "title": "GetMetadataRequest",
            "type": "object"
          }
        },
        "properties": {
          "request": {
            "$ref": "#/$defs/GetMetadataRequest"
          }
        },
        "required": [
          "request"
        ],
        "title": "s3_get_file_metadataArguments",
        "type": "object"
      },
      "meta": {
        "display_name": "Get S3 File Metadata",
        "icon": "file-search",
        "category": "AWS",
        "description": "Get metadata for a specific file in S3.",
        "field_meta": {
          "bucket": {
            "type": "bucket"
          }
        }
      }
    },
    {
      "name": "s3_download_file",
      "description": "\n        Download a file from S3 to a local path.\n\n        Args:\n            request: DownloadFileRequest containing AWS credentials, bucket, key, and optional save_to\n            bucket: S3 bucket name (resolved dynamically from the UI connection)\n            key: S3 object key\n            save_to: Optional local destination path\n        ",
      "input_schema": {
        "$defs": {
          "DownloadFileRequest": {
            "description": "Input schema for s3_download_file.",
            "properties": {
              "aws_access_key_id": {
                "description": "AWS access key ID resolved from the selected S3 connection",
                "title": "AWS Access Key ID",
                "type": "string"
              },
              "aws_secret_access_key": {
                "description": "AWS secret access key resolved from the selected S3 connection",
                "title": "AWS Secret Access Key",
                "type": "string"
              },
              "region_name": {
                "description": "AWS region (e.g. us-east-1) resolved from the selected S3 connection",
                "title": "AWS Region",
                "type": "string"
              },
              "bucket": {
                "description": "S3 bucket name",
                "title": "Bucket Name",
                "type": "string"
              },
              "key": {
                "description": "S3 object key to download",
                "title": "Object Key",
                "type": "string"
              },
              "save_to": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": None,
                "description": "Optional full local path. If omitted, default Downloads folder is used.",
                "title": "Save To"
              }
            },
            "required": [
              "aws_access_key_id",
              "aws_secret_access_key",
              "region_name",
              "bucket",
              "key"
            ],
            "title": "DownloadFileRequest",
            "type": "object"
          }
        },
        "properties": {
          "request": {
            "$ref": "#/$defs/DownloadFileRequest"
          }
        },
        "required": [
          "request"
        ],
        "title": "s3_download_fileArguments",
        "type": "object"
      },
      "meta": {
        "display_name": "Download File from S3",
        "icon": "file-down",
        "category": "AWS",
        "description": "Download a file from S3 to a local path.",
        "field_meta": {
          "bucket": {
            "type": "bucket"
          },
          "save_to": {
            "type": "path"
          }
        }
      }
    },
    {
      "name": "s3_batch_upload",
      "description": "\n        Upload multiple files to an S3 bucket under a workflow/session path.\n        Local files are uploaded and presigned URLs are returned.\n\n        Args:\n            request: UploadBatch containing AWS credentials, bucket, workflow_id, session_id, and upload_file list\n            bucket: S3 bucket name (resolved dynamically from the UI connection)\n            workflow_id: Workflow identifier used to build the S3 prefix\n            session_id: Session identifier used to build the S3 prefix\n            upload_file: List of local file paths to upload\n        ",
      "input_schema": {
        "$defs": {
          "UploadBatch": {
            "description": "Input schema for s3_batch_upload.",
            "properties": {
              "aws_access_key_id": {
                "description": "AWS access key ID resolved from the selected S3 connection",
                "title": "AWS Access Key ID",
                "type": "string"
              },
              "aws_secret_access_key": {
                "description": "AWS secret access key resolved from the selected S3 connection",
                "title": "AWS Secret Access Key",
                "type": "string"
              },
              "region_name": {
                "description": "AWS region (e.g. us-east-1) resolved from the selected S3 connection",
                "title": "AWS Region",
                "type": "string"
              },
              "bucket": {
                "description": "S3 bucket name",
                "title": "Bucket Name",
                "type": "string"
              },
              "workflow_id": {
                "description": "Workflow identifier",
                "title": "Workflow ID",
                "type": "string"
              },
              "session_id": {
                "description": "Session identifier",
                "title": "Session ID",
                "type": "string"
              },
              "upload_file": {
                "description": "List of local file paths to upload",
                "items": {},
                "title": "Upload Files",
                "type": "array"
              }
            },
            "required": [
              "aws_access_key_id",
              "aws_secret_access_key",
              "region_name",
              "bucket",
              "workflow_id",
              "session_id",
              "upload_file"
            ],
            "title": "UploadBatch",
            "type": "object"
          }
        },
        "properties": {
          "request": {
            "$ref": "#/$defs/UploadBatch"
          }
        },
        "required": [
          "request"
        ],
        "title": "s3_batch_uploadArguments",
        "type": "object"
      },
      "meta": {
        "display_name": "Batch Upload Files to S3",
        "icon": "files",
        "category": "AWS",
        "description": "Upload multiple files to an S3 bucket under a workflow/session path.",
        "field_meta": {
          "bucket": {
            "type": "bucket"
          },
          "upload_file": {
            "type": "file",
            "multiple": True
          }
        }
      }
    }
]
