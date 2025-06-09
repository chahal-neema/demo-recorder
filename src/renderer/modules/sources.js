const { ipcRenderer } = require('electron');

async function getSources(type) {
    console.log('🔍 SourceManager.getSources called with type:', type);
    try {
        const sources = await ipcRenderer.invoke('get-sources', type);
        console.log('🔍 IPC get-sources returned:', sources);
        return sources;
    } catch (error) {
        console.error('❌ Error in getSources:', error);
        return [];
    }
}

function renderSources(sources, gridElement, onSelect) {
    console.log('🎨 SourceManager.renderSources called with:', sources.length, 'sources');
    console.log('🎨 Grid element:', gridElement);
    
    if (!gridElement) {
        console.error('❌ Grid element is null/undefined!');
        return;
    }
    
    gridElement.innerHTML = '';
    sources.forEach((source, index) => {
        console.log(`🎨 Rendering source ${index}:`, source);
        
        const item = document.createElement('div');
        item.className = 'source-item';
        item.dataset.id = source.id;
        item.dataset.name = source.name;

        const img = document.createElement('img');
        img.src = source.thumbnail ? source.thumbnail.toDataURL() : '';
        img.alt = source.name;
        
        img.onerror = () => {
            console.warn('Failed to load thumbnail for:', source.name);
            img.style.display = 'none';
        };

        const p = document.createElement('p');
        p.textContent = source.name;

        item.appendChild(img);
        item.appendChild(p);

        item.addEventListener('click', () => {
            console.log('🎯 Source item clicked:', source);
            console.log('🎯 Raw source data:', JSON.stringify(source, null, 2));
            
            // Better type detection
            let sourceType = 'screen'; // default
            if (source.id.includes('window:')) {
                sourceType = 'window';
            } else if (source.id.includes('screen:')) {
                sourceType = 'screen';
            }
            
            const selectedSource = { 
                id: source.id, 
                name: source.name, 
                type: sourceType,
                display_id: source.display_id // Make sure this is passed through
            };
            
            console.log('🎯 Selected source object:', selectedSource);
            
            document.querySelectorAll('.source-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            onSelect(selectedSource);
        });

        gridElement.appendChild(item);
    });
    
    console.log('✅ All sources rendered to grid');
}

module.exports = { getSources, renderSources }; 