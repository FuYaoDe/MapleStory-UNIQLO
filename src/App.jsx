import React, { useEffect, useMemo, useRef, useState } from "react";

const modules = import.meta.glob("../extracted_components/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

const BOARD_WIDTH_UNITS = 1000;
const BOARD_HEIGHT_UNITS = 1000;
const DEFAULT_ITEM_WIDTH = 160;

const initialAssets = Object.entries(modules)
  .map(([path, src]) => {
    const fileName = path.split("/").pop();
    const label = fileName.replace(/^\d+_/, "").replace(".png", "").replaceAll("_", " ");
    return {
      id: fileName.replace(".png", ""),
      fileName,
      label,
      src,
      aspect: 1,
    };
  })
  .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointerToBoard(event, boardElement) {
  const rect = boardElement.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * BOARD_WIDTH_UNITS,
    y: ((event.clientY - rect.top) / rect.height) * BOARD_HEIGHT_UNITS,
    inside:
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom,
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawGuideGrid(context, width, height) {
  context.save();
  context.strokeStyle = "rgba(147, 154, 163, 0.75)";
  context.lineWidth = 6;
  context.setLineDash([32, 32]);
  context.beginPath();

  for (let column = 1; column < 4; column += 1) {
    const x = (width / 4) * column;
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }

  for (let row = 1; row < 6; row += 1) {
    const y = (height / 6) * row;
    context.moveTo(0, y);
    context.lineTo(width, y);
  }

  context.stroke();
  context.restore();
}

export default function App() {
  const boardRef = useRef(null);
  const toastTimerRef = useRef(null);
  const [assets, setAssets] = useState(initialAssets);
  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const [placedItems, setPlacedItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [interaction, setInteraction] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    let alive = true;

    Promise.all(
      initialAssets.map(
        (asset) =>
          new Promise((resolve) => {
            const image = new Image();
            image.onload = () =>
              resolve({
                ...asset,
                aspect: image.naturalWidth / image.naturalHeight,
              });
            image.onerror = () => resolve(asset);
            image.src = asset.src;
          }),
      ),
    ).then((loadedAssets) => {
      if (alive) {
        setAssets(loadedAssets);
      }
    });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!interaction) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const board = boardRef.current;
      if (!board) {
        return;
      }

      const point = pointerToBoard(event, board);

      if (interaction.type === "move") {
        setPlacedItems((items) =>
          items.map((item) =>
            item.id === interaction.itemId
              ? {
                  ...item,
                  x: point.x - interaction.offsetX,
                  y: point.y - interaction.offsetY,
                }
              : item,
          ),
        );
      }

      if (interaction.type === "resize") {
        setPlacedItems((items) =>
          items.map((item) => {
            if (item.id !== interaction.itemId) {
              return item;
            }

            const nextWidth = point.x - item.x;
            return {
              ...item,
              width: clamp(nextWidth, 40, 720),
            };
          }),
        );
      }
    };

    const handlePointerUp = () => {
      setInteraction(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [interaction, assetMap]);

  useEffect(
    () => () => {
      window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        removeSelected();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId]);

  function addItem(asset, boardX = BOARD_WIDTH_UNITS / 2, boardY = BOARD_HEIGHT_UNITS / 2) {
    const id = `${asset.id}-${crypto.randomUUID()}`;
    const width = DEFAULT_ITEM_WIDTH;
    const height = width / asset.aspect;
    const item = {
      id,
      assetId: asset.id,
      x: boardX - width / 2,
      y: boardY - height / 2,
      width,
    };

    setPlacedItems((items) => [...items, item]);
    setSelectedId(id);
  }

  function addItemAtRandomPosition(asset) {
    const width = DEFAULT_ITEM_WIDTH;
    const height = width / asset.aspect;
    const maxX = Math.max(0, BOARD_WIDTH_UNITS - width);
    const maxY = Math.max(0, BOARD_HEIGHT_UNITS - height);
    addItem(asset, Math.random() * maxX + width / 2, Math.random() * maxY + height / 2);
  }

  function showAddedToast() {
    window.clearTimeout(toastTimerRef.current);
    setToastMessage("已成功加上");
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage("");
    }, 1800);
  }

  function handlePaletteClick(asset) {
    addItemAtRandomPosition(asset);
    showAddedToast();
  }

  function beginMove(event, item) {
    const board = boardRef.current;
    if (!board) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = pointerToBoard(event, board);
    setSelectedId(item.id);
    setInteraction({
      type: "move",
      itemId: item.id,
      offsetX: point.x - item.x,
      offsetY: point.y - item.y,
    });
  }

  function beginResize(event, item) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);
    setInteraction({ type: "resize", itemId: item.id });
  }

  function removeSelected() {
    setPlacedItems((items) => items.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }

  async function downloadJpg() {
    const canvas = document.createElement("canvas");
    const width = 1600;
    const height = 1600;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    drawGuideGrid(context, width, height);

    for (const item of placedItems) {
      const asset = assetMap.get(item.assetId);
      if (!asset) {
        continue;
      }

      const image = await loadImage(asset.src);
      const x = (item.x / BOARD_WIDTH_UNITS) * width;
      const y = (item.y / BOARD_HEIGHT_UNITS) * height;
      const itemWidth = (item.width / BOARD_WIDTH_UNITS) * width;
      const itemHeight = itemWidth / asset.aspect;
      context.drawImage(image, x, y, itemWidth, itemHeight);
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/jpeg", 0.95);
    link.download = "item-layout.jpg";
    link.click();
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>楓之谷 UNIQLO 客製 T-shirt 模擬器</h1>
        </div>
        <div className="actions">
          <button type="button" onClick={removeSelected} disabled={!selectedId}>
            Remove
          </button>
          <button type="button" onClick={() => setPlacedItems([])} disabled={placedItems.length === 0}>
            Clear
          </button>
          <button type="button" className="primary" onClick={downloadJpg} disabled={placedItems.length === 0}>
            JPG
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="Layout workspace">
        <div
          ref={boardRef}
          className="board"
          onPointerDown={() => setSelectedId(null)}
          aria-label="Square composition area with 4 by 6 guide grid"
        >
          {placedItems.map((item) => {
            const asset = assetMap.get(item.assetId);
            if (!asset) {
              return null;
            }

            const height = item.width / asset.aspect;
            const isSelected = selectedId === item.id;
            return (
              <div
                key={item.id}
                className={`placed-item ${isSelected ? "selected" : ""}`}
                style={{
                  left: `${(item.x / BOARD_WIDTH_UNITS) * 100}%`,
                  top: `${(item.y / BOARD_HEIGHT_UNITS) * 100}%`,
                  width: `${(item.width / BOARD_WIDTH_UNITS) * 100}%`,
                  height: `${(height / BOARD_HEIGHT_UNITS) * 100}%`,
                }}
                onPointerDown={(event) => beginMove(event, item)}
              >
                <img src={asset.src} alt="" draggable="false" />
                {isSelected && (
                  <>
                    <button
                      type="button"
                      className="item-remove"
                      aria-label="Remove selected item"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeSelected();
                      }}
                    >
                      ×
                    </button>
                    <span
                      className="resize-handle"
                      aria-hidden="true"
                      onPointerDown={(event) => beginResize(event, item)}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        <aside className="palette" aria-label="Item palette">
          {assets.map((asset) => (
            <button
              type="button"
              key={asset.id}
              className="asset-button"
              onClick={() => handlePaletteClick(asset)}
              title={asset.label}
            >
              <img src={asset.src} alt={asset.label} draggable="false" />
            </button>
          ))}
        </aside>
      </section>

      <div className={`toast ${toastMessage ? "visible" : ""}`} role="status" aria-live="polite">
        {toastMessage}
      </div>

      <footer className="copyright">圖片素材版權皆為 NEXON 所有。</footer>
    </main>
  );
}
