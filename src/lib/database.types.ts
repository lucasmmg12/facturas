// Este archivo define los tipos TypeScript que representan el esquema de la base de datos.
// Proporciona type-safety completo para todas las operaciones con Supabase.

export type UserRole = 'CARGA' | 'REVISION' | 'EXPORTACION';

export type InvoiceStatus =
  | 'UPLOADED'
  | 'PROCESSED'
  | 'PENDING_REVIEW'
  | 'READY_FOR_EXPORT'
  | 'EXPORTED'
  | 'ERROR';

export type InvoiceType =
  | 'FACTURA_A'
  | 'FACTURA_B'
  | 'FACTURA_C'
  | 'FACTURA_M'
  | 'NOTA_CREDITO_A'
  | 'NOTA_CREDITO_B'
  | 'NOTA_CREDITO_C'
  | 'NOTA_DEBITO_A'
  | 'NOTA_DEBITO_B'
  | 'NOTA_DEBITO_C';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          auth_user_id: string | null;
          email: string;
          full_name: string;
          role: UserRole;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          email: string;
          full_name: string;
          role?: UserRole;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          email?: string;
          full_name?: string;
          role?: UserRole;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      suppliers: {
        Row: {
          id: string;
          cuit: string;
          razon_social: string;
          tango_supplier_code: string | null;
          address: string | null;
          city: string | null;
          province: string | null;
          postal_code: string | null;
          phone: string | null;
          email: string | null;
          iva_condition: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          cuit: string;
          razon_social: string;
          tango_supplier_code?: string | null;
          address?: string | null;
          city?: string | null;
          province?: string | null;
          postal_code?: string | null;
          phone?: string | null;
          email?: string | null;
          iva_condition?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          cuit?: string;
          razon_social?: string;
          tango_supplier_code?: string | null;
          address?: string | null;
          city?: string | null;
          province?: string | null;
          postal_code?: string | null;
          phone?: string | null;
          email?: string | null;
          iva_condition?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
      };
      files: {
        Row: {
          id: string;
          original_filename: string;
          file_path: string;
          file_type: string;
          file_size: number | null;
          is_image: boolean;
          converted_to_pdf: boolean;
          converted_pdf_path: string | null;
          uploaded_by: string;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          original_filename: string;
          file_path: string;
          file_type: string;
          file_size?: number | null;
          is_image?: boolean;
          converted_to_pdf?: boolean;
          converted_pdf_path?: string | null;
          uploaded_by: string;
          uploaded_at?: string;
        };
        Update: {
          id?: string;
          original_filename?: string;
          file_path?: string;
          file_type?: string;
          file_size?: number | null;
          is_image?: boolean;
          converted_to_pdf?: boolean;
          converted_pdf_path?: string | null;
          uploaded_by?: string;
          uploaded_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          internal_invoice_id: string;
          file_id: string | null;
          supplier_id: string | null;
          supplier_cuit: string;
          supplier_name: string;
          invoice_type: InvoiceType;
          point_of_sale: string;
          invoice_number: string;
          issue_date: string;
          accounting_date: string | null;
          currency_code: string | null;
          exchange_rate: number | null;
          purchase_condition: string | null;
          receiver_cuit: string | null;
          receiver_name: string | null;
          net_taxed: number;
          net_untaxed: number;
          net_exempt: number;
          iva_amount: number;
          other_taxes_amount: number;
          advance_payment: number | null;
          discount: number | null;
          freight: number | null;
          interest: number | null;
          total_amount: number;
          is_electronic: boolean | null;
          cai_cae: string | null;
          cai_cae_expiration: string | null;
          non_computable_tax_credit: number | null;
          expense_code: string | null;
          sector_code: string | null;
          classifier_code: string | null;
          afip_operation_type_code: string | null;
          afip_voucher_code: string | null;
          destination_branch_number: string | null;
          observations: string | null;
          status: InvoiceStatus;
          ocr_confidence: number | null;
          validation_errors: any | null;
          notes: string | null;
          exported: boolean;
          export_batch_id: string | null;
          created_at: string;
          updated_at: string;
          created_by: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          internal_invoice_id?: string;
          file_id?: string | null;
          supplier_id?: string | null;
          supplier_cuit: string;
          supplier_name: string;
          invoice_type: InvoiceType;
          point_of_sale: string;
          invoice_number: string;
          issue_date: string;
          accounting_date?: string | null;
          currency_code?: string | null;
          exchange_rate?: number | null;
          purchase_condition?: string | null;
          receiver_cuit?: string | null;
          receiver_name?: string | null;
          net_taxed?: number;
          net_untaxed?: number;
          net_exempt?: number;
          iva_amount?: number;
          other_taxes_amount?: number;
          advance_payment?: number | null;
          discount?: number | null;
          freight?: number | null;
          interest?: number | null;
          total_amount: number;
          is_electronic?: boolean | null;
          cai_cae?: string | null;
          cai_cae_expiration?: string | null;
          non_computable_tax_credit?: number | null;
          expense_code?: string | null;
          sector_code?: string | null;
          classifier_code?: string | null;
          afip_operation_type_code?: string | null;
          afip_voucher_code?: string | null;
          destination_branch_number?: string | null;
          observations?: string | null;
          status?: InvoiceStatus;
          ocr_confidence?: number | null;
          validation_errors?: any | null;
          notes?: string | null;
          exported?: boolean;
          export_batch_id?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          internal_invoice_id?: string;
          file_id?: string | null;
          supplier_id?: string | null;
          supplier_cuit?: string;
          supplier_name?: string;
          invoice_type?: InvoiceType;
          point_of_sale?: string;
          invoice_number?: string;
          issue_date?: string;
          accounting_date?: string | null;
          currency_code?: string | null;
          exchange_rate?: number | null;
          purchase_condition?: string | null;
          receiver_cuit?: string | null;
          receiver_name?: string | null;
          net_taxed?: number;
          net_untaxed?: number;
          net_exempt?: number;
          iva_amount?: number;
          other_taxes_amount?: number;
          advance_payment?: number | null;
          discount?: number | null;
          freight?: number | null;
          interest?: number | null;
          total_amount?: number;
          is_electronic?: boolean | null;
          cai_cae?: string | null;
          cai_cae_expiration?: string | null;
          non_computable_tax_credit?: number | null;
          expense_code?: string | null;
          sector_code?: string | null;
          classifier_code?: string | null;
          afip_operation_type_code?: string | null;
          afip_voucher_code?: string | null;
          destination_branch_number?: string | null;
          observations?: string | null;
          status?: InvoiceStatus;
          ocr_confidence?: number | null;
          validation_errors?: any | null;
          notes?: string | null;
          exported?: boolean;
          export_batch_id?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string;
          updated_by?: string | null;
        };
      };
      tax_codes: {
        Row: {
          id: string;
          code: string;
          tango_code: string;
          description: string;
          tax_type: string;
          rate: number | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          tango_code: string;
          description: string;
          tax_type: string;
          rate?: number | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          tango_code?: string;
          description?: string;
          tax_type?: string;
          rate?: number | null;
          active?: boolean;
          created_at?: string;
        };
      };
      invoice_taxes: {
        Row: {
          id: string;
          invoice_id: string;
          tax_code_id: string;
          tax_base: number;
          tax_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          tax_code_id: string;
          tax_base?: number;
          tax_amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          tax_code_id?: string;
          tax_base?: number;
          tax_amount?: number;
          created_at?: string;
        };
      };
      tango_concepts: {
        Row: {
          id: string;
          tango_concept_code: string;
          description: string;
          active: boolean;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          tango_concept_code: string;
          description: string;
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          tango_concept_code?: string;
          description?: string;
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
        };
      };
      invoice_concepts: {
        Row: {
          id: string;
          invoice_id: string;
          tango_concept_id: string;
          amount: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          tango_concept_id: string;
          amount: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          tango_concept_id?: string;
          amount?: number;
          notes?: string | null;
          created_at?: string;
        };
      };
      export_batches: {
        Row: {
          id: string;
          filename: string;
          file_path: string | null;
          invoice_count: number;
          total_amount: number;
          generated_by: string;
          generated_at: string;
        };
        Insert: {
          id?: string;
          filename: string;
          file_path?: string | null;
          invoice_count?: number;
          total_amount?: number;
          generated_by: string;
          generated_at?: string;
        };
        Update: {
          id?: string;
          filename?: string;
          file_path?: string | null;
          invoice_count?: number;
          total_amount?: number;
          generated_by?: string;
          generated_at?: string;
        };
      };
      audit_log: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          changes: any | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          changes?: any | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          changes?: any | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
    };
  };
}
