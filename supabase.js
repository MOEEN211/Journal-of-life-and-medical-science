// Supabase Client and Dynamic Data Layer for Journal of Life and Medical Science
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://pmbqtxzynycmbwnzeuez.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtYnF0eHp5bnljbWJ3bnpldWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzAzMzksImV4cCI6MjEwNjI0NjMzOX0.gD92wjwSXMxJX2OtEdl7jXQ6oRxsNGV5IAFII8HUBIk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// EmailJS Configuration
export const EMAILJS_CONFIG = {
  serviceId: 'service_fxml9ya',
  templateId: 'template_s6zm9qu',
  publicKey: 'S5TuNJR57V2HY5sEO'
};

/**
 * Fetch dynamic journal settings & branding
 */
export async function getJournalSettings() {
  try {
    const { data, error } = await supabase
      .from('journal_settings')
      .select('value')
      .eq('key', 'general')
      .single();

    if (error) throw error;
    const val = data?.value || {};
    return {
      ...val,
      journal_name: 'Journal of Life and Medical Science',
      journal_tagline: val.journal_tagline || 'International Peer-Reviewed Open Access Publication',
      hero_title_prefix: 'Pioneering Discoveries in',
      hero_title_highlight: 'Life & Medical Sciences',
      hero_description: 'An internationally recognized scholarly medium accelerating groundbreaking medical observations, biological research, and clinical advancements with rigorous peer review.',
      contact_email: val.contact_email || 'editor@jlms-journal.org'
    };
  } catch (err) {
    console.warn('Using default journal settings due to fetch issue:', err.message);
    return {
      journal_name: 'Journal of Life and Medical Science',
      journal_tagline: 'International Peer-Reviewed Open Access Publication',
      issn_online: '3007-1607',
      issn_print: '3007-1593',
      publisher: 'Institute for Excellence in Education and Research (IEER)',
      publisher_short: 'IEER Global',
      hero_title_prefix: 'Pioneering Discoveries in',
      hero_title_highlight: 'Life & Medical Sciences',
      hero_description: 'An internationally recognized scholarly medium accelerating groundbreaking medical observations, biological research, and clinical advancements with rigorous peer review.',
      contact_email: 'editor@jlms-journal.org',
      office_address: 'Global Research Park, Medical Sciences Wing'
    };
  }
}

/**
 * Fetch dynamic editorial board members
 */
export async function getEditorialMembers() {
  try {
    const { data, error } = await supabase
      .from('editorial_members')
      .select('*')
      .order('order_index', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching editorial members:', err);
    return [];
  }
}

/**
 * Fetch dynamic journal policies
 */
export async function getJournalPolicies() {
  try {
    const { data, error } = await supabase
      .from('journal_policies')
      .select('*')
      .order('order_index', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching journal policies:', err);
    return [];
  }
}

/**
 * Fetch dynamic indexing & database agencies
 */
export async function getJournalIndexing() {
  try {
    const { data, error } = await supabase
      .from('journal_indexing')
      .select('*')
      .order('order_index', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching journal indexing:', err);
    return [];
  }
}

/**
 * Fetch current active issue
 */
export async function getCurrentIssue() {
  try {
    const { data: issue, error: issueErr } = await supabase
      .from('issues')
      .select('*')
      .eq('is_current', true)
      .single();

    if (issueErr || !issue) {
      const { data: latest } = await supabase
        .from('issues')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(1)
        .single();
      return latest;
    }
    return issue;
  } catch (err) {
    console.error('Error fetching current issue:', err);
    return null;
  }
}

/**
 * Fetch articles for a specific issue ID
 */
export async function getIssueArticles(issueId) {
  try {
    let query = supabase
      .from('articles')
      .select(`
        *,
        sections(id, title),
        article_authors(*)
      `);

    if (issueId) {
      query = query.or(`issue_id.eq.${issueId},status.eq.published`);
    }

    const { data: articles, error } = await query
      .order('created_at', { ascending: false });

    if (error) throw error;
    return articles || [];
  } catch (err) {
    console.error('Error fetching issue articles:', err);
    return [];
  }
}

/**
 * Fetch all archived issues
 */
export async function getAllIssues() {
  try {
    const { data, error } = await supabase
      .from('issues')
      .select(`
        *,
        articles(count)
      `)
      .order('year', { ascending: false })
      .order('number', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching all issues:', err);
    return [];
  }
}

/**
 * Fetch single article details with full relationships
 */
export async function getArticleDetails(articleId) {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select(`
        *,
        issues(*),
        sections(*),
        article_authors(*)
      `)
      .eq('id', articleId)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error fetching article details:', err);
    return null;
  }
}

/**
 * Increment view count or download count for an article
 */
export async function recordMetric(articleId, metricType = 'views_count') {
  try {
    const { data: current } = await supabase
      .from('articles')
      .select(metricType)
      .eq('id', articleId)
      .single();

    if (current) {
      const updatedVal = (current[metricType] || 0) + 1;
      await supabase
        .from('articles')
        .update({ [metricType]: updatedVal })
        .eq('id', articleId);
    }
  } catch (err) {
    console.warn('Metrics update:', err.message);
  }
}

/**
 * Submit manuscript from author
 */
export async function submitManuscript(submissionPayload) {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .insert([submissionPayload])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Submission error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get submissions by author email
 */
export async function getAuthorSubmissions(email) {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('author_email', email)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching submissions:', err);
    return [];
  }
}

/**
 * Supabase Auth: Register new user & guarantee instant login
 */
export async function registerUser(email, password, fullName, affiliation, role = 'author') {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          affiliation: affiliation,
          role: role
        }
      }
    });

    if (error) throw error;

    // Record or update user profile in public.profiles table
    if (data?.user) {
      await supabase.from('profiles').upsert({
        auth_id: data.user.id,
        email: email,
        full_name: fullName,
        affiliation: affiliation,
        role: role
      }, { onConflict: 'email' });
    }

    // If no session was returned immediately, log in to establish the session
    if (!data.session) {
      const loginRes = await supabase.auth.signInWithPassword({ email, password });
      if (loginRes.data?.session) {
        return { success: true, data: loginRes.data };
      }
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Supabase Auth: Sign in existing user
 */
export async function loginUser(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Supabase Auth: Sign out
 */
export async function logoutUser() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get currently authenticated user and profile
 */
export async function getCurrentUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) return null;
    return session.user;
  } catch {
    return null;
  }
}

/**
 * Upload manuscript file (PDF, DOCX, etc.) directly to Supabase Storage bucket 'manuscripts'
 */
export async function uploadManuscriptFile(file) {
  try {
    if (!file) throw new Error('No file provided');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `manuscripts_${Date.now()}_${safeName}`;

    const { data, error } = await supabase.storage
      .from('manuscripts')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from('manuscripts')
      .getPublicUrl(filePath);

    return {
      success: true,
      fileName: file.name,
      fileUrl: publicUrlData.publicUrl
    };
  } catch (err) {
    console.warn('Supabase storage upload note:', err.message);
    return {
      success: false,
      error: err.message,
      fileName: file?.name || 'manuscript.pdf',
      fileUrl: null
    };
  }
}
