import { useState } from 'react';

export default function Home() {
    const [file, setFile] = useState(null);
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = async () => {
        if (!file) {
            alert('Please upload a PDF file.');
            return;
        }

        setLoading(true);

        try {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64File = reader.result.split(',')[1];

                const response = await fetch('/api/checkAccessibility', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fileContent: base64File,
                        fileName: file.name,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    alert(`Error: ${errorData.error}`);
                    setLoading(false);
                    return;
                }

                const data = await response.json();
                setResults(data.results);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            alert('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h1>PDF Accessibility Checker</h1>
            <input type="file" accept="application/pdf" onChange={handleFileChange} />
            <button onClick={handleSubmit} disabled={loading}>
                {loading ? 'Checking...' : 'Check Accessibility'}
            </button>

            {results && (
                <div>
                    <h2>Accessibility Results</h2>
                    <pre>{JSON.stringify(results, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
